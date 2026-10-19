export function getState() {
    return { 
        /*TODO*/
    }
} 

export function setState(state) {
    /*TODO*/
}

export function declareVariables() {
    /*TODO Report according to the configuration */ 
	return [
		{ 
			name: 'VarA',
	  		type: 'Integer',
	  		defaultValue: 0,
	  		namedValues: []
	  	}
	];
}
 
export function setVariable()
{
	postSetVariable('VarA', 3, 1)
}

 
export function acceptOperatorMessage(data) {	
	receivedFromRuntime = data.join();
	 console.log(data);
}


function jsonEditorConfig() {
		return new Promise((resolve, reject) => {
			fetch("./schema.json")
			.then(response => response.json())
			.then(jsonSchemaData => {
				resolve({
							jsonSchema: JSON.stringify(jsonSchemaData),
							configFileName: 'config.json' 
						});
			})
			.catch(error => reject(error));
		 });
}
		
	
export function startListeningToJsonEditorConfigRequests(configFileName) {
	window.addEventListener(
	"message",
	(event) => {    
		// Not every message on this window is JSON meant for us (e.g. the verona-player posts
		// plain objects, not JSON strings) -- ignore anything that isn't parseable.
		let callId;
		try {
			({ callId } = JSON.parse(event.data));
		} catch {
			return;
		}
		if(callId !== undefined && callId.includes("importJsonData")) {
			jsonEditorConfig().then(data => {
				const pass_data = {
					jsonSchema: data.jsonSchema,
					configFileName: configFileName ?? data.configFileName,
					callId
				} 
				try {
					window.parent.postMessage(JSON.stringify(pass_data), '*');
				} catch (error) {
					console.log("error on external listener - ", error);
				}			           		
			}).catch(error => {
				console.error('Error fetching json editor configuration:', error);
			});
		}
	}, false);
}
	


  



// ------------------ methods for generic use ----------------------------------------------------------

export function acceptGetVariableResult(name, type, value, callId) {
	
}

// startListeningToRuntimePostMessageEvents(acceptGetVariableResult, acceptOperatorMessage);

/**
 * Trigger a state machine event in the CBA runtime. 
 * 
 * The traceCount parameter must be an integer value greater or equal 0 and
 * specifies wether the given the event will count as one or more user interactions.   
 */
 export function postStatemachineEvent(eventName, traceCount)
{
	postMessageWithPaths({
        microfinEvent: eventName,
        traceCount: traceCount
	});
}

/**
 * Inject a message into the trace log of the CBA runtime. 
 * 
 * The traceType parameter is optional. It determines the trace type attribute 
 * of the injected trace message.
 * 
 * The traceCount parameter must be an integer value greater or equal 0 and
 * specifies wether the given the event will count as one or more user interactions.   
 */
 export function postTraceMessage(traceMessage, traceType, traceCount)
{
	postMessageWithPaths({
    	traceMessage: traceMessage,
        traceType: traceType,
        traceCount: traceCount
	});
}

/**
 * Get the value of a variable in the CBA runtime. 
 * 
 * The callId parameter should be used to match the call to the 
 * result coming in via the getVariableResultCallback (see startListeningToPostMessageEvents method).
 */
 export function postGetVariable(variableName, callId)
{
	postMessageWithPaths({
    	getVariable: {
    	  variableName: variableName,
    	  callId: callId,
    	},
        traceCount: 0

	});
}

/**
 * Set the value of a variable in the CBA runtime. 
 * 
 * The traceCount parameter must be an integer value greater or equal 0 and
 * specifies wether the given the event will count as one or more user interactions.   
 */
export function postSetVariable(variableName, variableValue, traceCount)
{
	postMessageWithPaths({
    	setVariable: {
    	  variableName: variableName,
    	  newValue: variableValue,
    	},
        traceCount: traceCount
	});
}

/**
 * Send the given payload as an event to the CBA runtime 
 * and implicitly extend it with the paths of our hosting ExternalPageFrame component.
 * 
 * This might might not work if the ExternalPageFrame content comes
 * from an external server. 
 * 
 */
export function postMessageWithPaths(payload)
{
	payload.indexPath = getIndexPath();
	payload.userDefIdPath = getUserDefIdPath();
	postMessageWithErrorLog(payload);
}

/**
 * Send an event to the CBA runtime.
 */
export function postMessageWithErrorLog(payload)
{
	try
	{
		// TODO: adapt the target origin  
		window.parent.postMessage(JSON.stringify(payload), '*');	
	} 
	catch(e) {
		console.debug(e); 
	}
}

/**
 * Obtain the path of user defined IDs leading to our hosting ExternalPageFrame component.
 * 
 * You might use this as value for the userDefIdPath attribute in the message payload structure
 * when sending events to the CBA runtime.
 * 
 * This might might not work if the ExternalPageFrame content comes
 * from an external server. 
 */
 export function getUserDefIdPath()
{
	return getQueryVariable('userDefIdPath');
}

/**
 * Obtain the index path of our hosting ExternalPageFrame component.
 * 
 * You might use this as value for the userDefIdPath attribute in the message payload structure
 * when sending events to the CBA runtime.
 * 
 * This might might not work if the ExternalPageFrame content comes
 * from an external server. 
 */
export function getIndexPath() 
{
	return getQueryVariable('indexPath');
}

/**
 * Obtain the value of a query variable from the calling URL. 
 * 
 * @variable: The name of the variable in the URL query.
 */
export function getQueryVariable(variable)
{
	const parsedUrl = new URL(window.location.href);
	return parsedUrl.searchParams.get(variable);
}

/**
 * Start listening on post message events coming in from the CBA runtime.
 * 
 * The getVariableResultCallback parameter should be a method that accepts four parameters: 
 *   - name: the name of the variable
 *   - type: the data type of the variable
 *   - value: the value of the variable
 *   - callId: the callId of the getVariable call that triggered this result message.
 * 
 * The operatorMessageCallback parameter should be a method that accepts an array.
 * 
 */
 export function startListeningToRuntimePostMessageEvents(getVariableResultCallback, operatorMessageCallback) {
    window.addEventListener(
	"message", 
	(event) => {	  
		const payload = JSON.parse(event.data);		
		if (payload !== null && typeof(payload) === 'object' && payload.callId !== undefined) {
            if (payload.result !== null && typeof(payload.result) === 'object') {
			    const { name, type, value } = payload.result;			
			    getVariableResultCallback(name, type, value, payload.callId);
            }   
		} 
		else if (Array.isArray(payload)) { 
			if(typeof operatorMessageCallback === 'function')
				operatorMessageCallback(payload);
		}
	}, 
	false);
 }


// startListeningToVariableDeclarationRequests(declareVariables);


/* TODO: Add example to provide JSON-Schema */

/**
 * Start listening on post message events coming in from the item builder during time design time.
 * 
 * The declareVariableCallback parameter should be a method that expects no parameter and returns 
 * an array of variable declaration objects with these attributes:
 *   - name: the name of the variable
 *   - type: the type of the variable, one of 'Integer', 'Number', 'String', 'Boolean'
 *   - defaultValue: the initial value of the variable
 *   - namedValues: an array of objects with a name and a value attribute. 
 */
 export function startListeningToVariableDeclarationRequests(declareVariableCallback) {
    // listener for providing initial variable data signal.
    window.addEventListener(
    "message",
    (event) => {    
        // Not every message on this window is JSON meant for us (see comment above).
        let callId;
        try {
            ({ callId } = JSON.parse(event.data));
        } catch {
            return;
        }
        if(typeof callId !== "undefined" && callId.includes("importVariables")) {
            const variables = declareVariableCallback();
            const pass_data = {
				initialVariables: variables,
				callId
            }
            try {
                window.parent.postMessage(JSON.stringify(pass_data), '*');
            } catch (error) {
                console.log("error on external listener - ", error);
            }
        }
    },
    false);
 }
 
export default {
	getState,
	setState,
	declareVariables,
	setVariable,
	acceptOperatorMessage,
	acceptGetVariableResult,
	postStatemachineEvent,
	postTraceMessage,
	postGetVariable,
	postSetVariable,
	postMessageWithPaths,
	postMessageWithErrorLog,
	getUserDefIdPath,
	getIndexPath,
	getQueryVariable,
	startListeningToRuntimePostMessageEvents,
	startListeningToVariableDeclarationRequests,
	startListeningToJsonEditorConfigRequests
};