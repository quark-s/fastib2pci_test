/*
Integration bridge between this ExternalPageFrame (EPF) and a nested verona-player iframe.
Loads a single unit (configured via config.json) into the player with no user interaction,
keeps CBA's getState/setState in sync with the player's vopStateChangedNotification, forwards
the player's log entries as CBA trace messages, and bridges the unit's response variables
(declared in the companion .xml's <BaseVariables>) to CBA's declareVariables/setVariable.
*/

import {
  postTraceMessage,
  postMessageWithPaths,
  postStatemachineEvent,
  startListeningToJsonEditorConfigRequests
} from './ib.js';

// Unit definition "type" values (including the speedtest one's own typo -- that's the real value).
const UNIT_TYPE_ASPECT = 'aspect-unit-definition';
const UNIT_TYPE_SPEEDTEST = 'speedtest-unit-defintion';
const PLAYER_SRC_BY_TYPE = {
  [UNIT_TYPE_ASPECT]: './player/iqb-player-aspect-3.0.0.html',
  [UNIT_TYPE_SPEEDTEST]: './player/iqb-player-speedtest-3.3.0.html'
};
const sessionId = `epf-${Date.now()}`;

let config = null;
let unitDefinitionText = null;
let playerSrc = null;
let variableDeclarations = [];
let knownAliases = new Set();
let aliasToType = new Map();
let previousValueByAlias = new Map();
let playerFrameWindow = null;
let restoredState = null;
let latestUnitState = null;
let latestPlayerState = null;
let loadPromise = null;

function log(...values) {
  if (config?.debugMode) {
    // eslint-disable-next-line no-console
    console.debug('[epf-player-bridge]', ...values);
  }
}

function mapVariableType(xmlType) {
  if (xmlType === 'integer') return 'Integer';
  if (xmlType === 'number') return 'Number';
  return 'String';
}

// CBA variable names may not start with a digit -- aliases like "01a" would otherwise be
// rejected, so every CBA-facing variable name gets this prefix. Both declareVariables() and
// setVariable() must go through this so the declared and set names always match.
function toVariableName(alias) {
  return `V_${alias.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/** Only elements with a real response type carry a value; text/image/button elements don't.
 *  The player reports responses keyed by alias already (not the raw XML id), so declared
 *  variable names double as the lookup key for the runtime elementCodes bridge below. */
function parseBaseVariables(xmlText) {
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const declarations = [];
  const aliases = new Set();
  const types = new Map();
  xmlDoc.querySelectorAll('BaseVariables > Variable').forEach(variableNode => {
    const xmlType = variableNode.getAttribute('type');
    if (xmlType === 'no-value') return;
    const alias = variableNode.getAttribute('alias') || variableNode.getAttribute('id');
    const type = mapVariableType(xmlType);
    aliases.add(alias);
    // setVariable's newType uses a different (undocumented, lowercase, typeof-style) vocabulary
    // than declareVariables' type -- confirmed against the runtime's own checkType() function.
    types.set(alias, type.toLowerCase());
    const namedValues = Array.from(variableNode.querySelectorAll('Values > Value')).map((valueNode, index) => ({
      name: valueNode.querySelector('label')?.textContent ? valueNode.querySelector('label')?.textContent.replace(/\s+/g, '_') : `value_${index}`,
      value: valueNode.querySelector('value')?.textContent ?? ''
    }));
    declarations.push({
      name: toVariableName(alias),
      type,
      defaultValue: type === 'String' ? '' : -99,
      namedValues
    });
  });
  return { declarations, aliases, types };
}

function getDeclaredType(xmlDoc, id) {
  const node = xmlDoc.querySelector(`BaseVariables > Variable[id="${id}"]`);
  return node ? mapVariableType(node.getAttribute('type')) : 'Integer';
}

/** Speedtest units declare a single generic "value"/"time" pair in their BaseVariables XML, but
 *  the player actually reports one independent value/time per question (dataParts key
 *  "question_<index>", see forwardQuestionVariableChanges) -- expand that pair into one declared
 *  variable per question instead, using the question count from the unit definition itself. */
function buildSpeedtestQuestionVariables(variablesXmlText, unitDefinitionObject) {
  const xmlDoc = new DOMParser().parseFromString(variablesXmlText, 'application/xml');
  const valueType = getDeclaredType(xmlDoc, 'value');
  const timeType = getDeclaredType(xmlDoc, 'time');
  const questionCount = unitDefinitionObject.questions?.length ?? 0;

  const declarations = [];
  const aliases = new Set();
  const types = new Map();

  for (let index = 0; index < questionCount; index += 1) {
    [['value', valueType], ['time', timeType]].forEach(([baseAlias, type]) => {
      const alias = `${baseAlias}_${index}`;
      aliases.add(alias);
      types.set(alias, type.toLowerCase());
      declarations.push({
        name: toVariableName(alias),
        type,
        defaultValue: -99,
        namedValues: []
      });
    });
  }

  return { declarations, aliases, types };
}

/** ItemBuilder's "Import Variables" shows whatever declareVariables() returns with no useful
 *  context on failure -- surface the actual error as a fake variable instead, so it's visible
 *  in the ItemBuilder UI rather than only in this frame's own (rarely checked) console. */
function buildErrorVariables(step, error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return [{
    name: `EPF_ERROR_${step}`,
    type: 'String',
    defaultValue: message.slice(0, 500),
    namedValues: []
  }];
}

async function loadConfig() {
  const response = await fetch('./config.json');
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching config.json`);
  return response.json();
}

async function loadUnitAndVariables(loadedConfig) {
  const unitResponse = await fetch(`./units/${loadedConfig.unitFile}`);
  if (!unitResponse.ok) throw new Error(`HTTP ${unitResponse.status} fetching unit "${loadedConfig.unitFile}"`);
  unitDefinitionText = await unitResponse.text();
  const unitDefinitionObject = JSON.parse(unitDefinitionText);

  const unitType = unitDefinitionObject.type;
  playerSrc = PLAYER_SRC_BY_TYPE[unitType];
  if (!playerSrc) {
    throw new Error(`No player configured for unit type "${unitType}" (${loadedConfig.unitFile})`);
  }

  const variablesResponse = await fetch(`./units/${loadedConfig.variablesFile}`);
  if (!variablesResponse.ok) {
    throw new Error(`HTTP ${variablesResponse.status} fetching variables file "${loadedConfig.variablesFile}"`);
  }
  const variablesXmlText = await variablesResponse.text();
  const genericVariables = parseBaseVariables(variablesXmlText);

  if (unitType === UNIT_TYPE_SPEEDTEST) {
    // "value"/"time" are declared once in the XML but are really per-question -- drop the
    // generic pair and declare one value_<index>/time_<index> variable per question instead.
    // total_correct/total_wrong stay exactly as the generic XML declared them.
    genericVariables.declarations = genericVariables.declarations.filter(
      declaration => declaration.name !== toVariableName('value') && declaration.name !== toVariableName('time')
    );
    genericVariables.aliases.delete('value');
    genericVariables.aliases.delete('time');
    const questionVariables = buildSpeedtestQuestionVariables(variablesXmlText, unitDefinitionObject);
    genericVariables.declarations.push(...questionVariables.declarations);
    questionVariables.aliases.forEach(alias => genericVariables.aliases.add(alias));
    questionVariables.types.forEach((type, alias) => genericVariables.types.set(alias, type));
  }

  ({ declarations: variableDeclarations, aliases: knownAliases, types: aliasToType } = genericVariables);

  if (variableDeclarations.length === 0) {
    log('warning: parsed 0 variable declarations from', loadedConfig.variablesFile);
  }
}

/** Loads config/unit/variables exactly once no matter how many times or how early this is
 *  called -- callers just await it instead of racing the fetches themselves. */
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        config = await loadConfig();
      } catch (error) {
        variableDeclarations = buildErrorVariables('loadConfig', error);
        log('init failed at loadConfig', error);
        return;
      }
      try {
        await loadUnitAndVariables(config);
      } catch (error) {
        variableDeclarations = buildErrorVariables('loadUnitAndVariables', error);
        log('init failed at loadUnitAndVariables', error);
      }
    })();
  }
  return loadPromise;
}

function createPlayerFrame() {
  const iframe = document.createElement('iframe');
  iframe.src = playerSrc;
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  // iframes default to display:inline, which reserves a few px of descender space below them
  // and pushes the page just past 100% height -- causing a vertical scrollbar for no visible content.
  iframe.style.display = 'block';
  document.getElementById('app').appendChild(iframe);
  return iframe.contentWindow;
}

function sendStartCommand() {
  log('sending vopStartCommand', { sessionId, restoredState });
  // vopStartCommand has no playerState field -- the closest restorable equivalent is the page
  // to open on, via playerConfig.startPage.
  const currentPage = restoredState?.playerState?.currentPage;
  playerFrameWindow.postMessage({
    type: 'vopStartCommand',
    sessionId,
    unitDefinition: unitDefinitionText,
    unitState: restoredState?.unitState,
    playerConfig: currentPage !== undefined ? { startPage: currentPage } : undefined
  }, '*');
}

function forwardLogEntriesToTrace(logEntries) {
  (logEntries || []).forEach(logEntry => postTraceMessage(logEntry, logEntry.key, 1));
}

/** Includes newType on every call (not just the first) -- the CBA runtime only auto-registers
 *  an unknown variable when a type is given, and it's a no-op once the variable already exists
 *  with a matching type, so it's safe to always send it. traceMessage/traceType ride along on
 *  the same message so every variable change also lands a JavaScriptInjected trace log entry. */
function setVariable(alias, value) {
  const variableName = toVariableName(alias);
  const newValue = isNaN(value) ? JSON.stringify(value) : value;
  postMessageWithPaths({
    setVariable: { variableName, newValue: newValue, newType: aliasToType.get(alias) },
    traceMessage: { variableName, newValue: newValue },
    traceType: 'variableChanged',
    traceCount: 1
  });
}

/** Shared by both forwarding functions below: only pushes to CBA when the alias is actually
 *  declared and the value genuinely changed, and logs a trace entry for every change (in
 *  addition to the traceMessage that already rides along on setVariable's own message). */
function forwardVariableChangeIfKnown(alias, value) {
  // Unanswered items report value:null, which would fail the CBA runtime's type check against
  // the Integer/Number/Boolean type declared for them -- wait for a real value.
  const hasValue = value !== null && value !== undefined;
  if (!hasValue || !knownAliases.has(alias) || previousValueByAlias.get(alias) === value) return;
  log('setVariable', alias, value);
  postTraceMessage({ variableName: toVariableName(alias), newValue: value }, 'variableChanged', 1);
  setVariable(alias, value);
  previousValueByAlias.set(alias, value);
}

/** total_correct/total_wrong (and, for the aspect player, every element on the page) are unit-wide:
 *  the dataParts key doesn't matter, only the item's own id, matched directly against the
 *  declared aliases. The "question_<n>" parts are skipped here -- forwardQuestionVariableChanges
 *  handles those, since their items' ids ("value"/"time") need the question index appended. */
function forwardGlobalVariableChanges(dataParts) {
  if (!dataParts) return;
  Object.entries(dataParts).forEach(([partKey, partJson]) => {
    if (/^question_\d+$/.test(partKey)) return;
    let items;
    try {
      items = JSON.parse(partJson);
    } catch {
      return;
    }
    items.forEach(item => forwardVariableChangeIfKnown(item.id, item.value));
  });
}

/** Speedtest units report one independent value/time pair per question, under a "question_<n>"
 *  dataParts key -- each pair maps to its own value_<n>/time_<n> CBA variable (declared in
 *  buildSpeedtestQuestionVariables). No-op for units without any "question_<n>" parts. */
function forwardQuestionVariableChanges(dataParts) {
  if (!dataParts) return;
  Object.entries(dataParts).forEach(([partKey, partJson]) => {
    const match = partKey.match(/^question_(\d+)$/);
    if (!match) return;
    const questionIndex = match[1];
    let items;
    try {
      items = JSON.parse(partJson);
    } catch {
      return;
    }
    items.forEach(item => forwardVariableChangeIfKnown(`${item.id}_${questionIndex}`, item.value));
  });
}

/** The player only asks to move past its own unit boundary; it has no notion of "task" -- that
 *  request has to reach the item's own state machine as an event, whose transition rule the item
 *  author wires up to the next_task()/back_task() DSL operators (there is no direct API to
 *  switch tasks from an EPF). Event names are configurable since that wiring is arbitrary. */
function requestTaskSwitch(target) {
  const eventName = target === 'next' || target === 'end' ? config?.nextTaskEvent ?? 'EV_nextTask'
    : target === 'previous' || target === 'first' ? config?.previousTaskEvent ?? 'EV_previousTask'
      : null;
  if (!eventName) {
    log('no task switch mapping for navigation target', target);
    return;
  }
  log('postStatemachineEvent', eventName);
  postStatemachineEvent(eventName, 1);
}

function handlePlayerMessage(data) {
  if (data?.type === 'vopReadyNotification') {
    sendStartCommand();
  } else if (data?.type === 'vopStateChangedNotification') {
    latestUnitState = data.unitState ?? latestUnitState;
    latestPlayerState = data.playerState ?? latestPlayerState;
    if(data.playerState)
        forwardLogEntriesToTrace([{
          key: 'playerStateChanged',
          message: `${JSON.stringify(data.playerState)}`
        }]);
    if(data.log)
      forwardLogEntriesToTrace(data.log);
    forwardGlobalVariableChanges(data.unitState?.dataParts);
    forwardQuestionVariableChanges(data.unitState?.dataParts);
  }
  else if(data?.type === 'vopLogNotification') {
    if(data.log)
      forwardLogEntriesToTrace(data.log);
  }
  else if(data?.type === 'vopWindowFocusChangedNotification') {
    if(data.hasFocus !== undefined)
      forwardLogEntriesToTrace([{
        key: 'windowFocusChanged',
        message: `${data.hasFocus}`
      }]);
  }
  else if(data?.type === 'vopUnitNavigationRequestedNotification') {
    if(data.target)
      forwardLogEntriesToTrace([{
        key: 'unitNavigationRequested',
        message: `${JSON.stringify(data.target)}`
      }]);
    requestTaskSwitch(data.target);
    }
  }

function attachPlayerMessageListener() {
  // Dispatch on data.type rather than event.source: the player itself does the same (see
  // VeronaSubscriptionService), and event.source identity isn't reliable across the cross-origin
  // (file://) iframe boundary used here.
  window.addEventListener('message', event => {
    let data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    handlePlayerMessage(data);
  });
}

/** CBA calls these directly on this frame's window, synchronously, possibly seconds
 *  before our own init() below has finished loading config/unit/variables. */
function wireGlobalState() {
  window.getState = () => ({
    unitFile: config?.unitFile,
    unitState: latestUnitState,
    playerState: latestPlayerState
  });
  window.setState = savedState => {
    restoredState = savedState;
    // Player already running (mid-session restore, not the initial vopReadyNotification handshake
    // that already picks up restoredState on its own) -- push the restored state to it right away.
    //if (playerFrameWindow) {
    //  sendStartCommand();
    //}
  };
}

/** ib.js's startListeningToVariableDeclarationRequests() calls its callback synchronously and
 *  posts whatever it returns immediately -- no way to make it wait for the fetches above. Our
 *  own listener awaits ensureLoaded() before ever replying instead, so ItemBuilder's "Import
 *  Variables" always gets the real (or error) result, however long loading takes, rather than
 *  racing it and settling for a still-loading placeholder. */
function attachVariableDeclarationListener() {
  window.addEventListener('message', async event => {
    if (typeof event.data !== 'string') return;
    let callId;
    try {
      ({ callId } = JSON.parse(event.data));
    } catch {
      return;
    }
    if (typeof callId !== 'string' || !callId.includes('importVariables')) return;
    await ensureLoaded();
    window.parent.postMessage(JSON.stringify({ initialVariables: variableDeclarations, callId }), '*');
  });
}

export async function init() {
  wireGlobalState();
  startListeningToJsonEditorConfigRequests('config.json');
  attachVariableDeclarationListener();
  await ensureLoaded();
  playerFrameWindow = createPlayerFrame();
  attachPlayerMessageListener();
}
