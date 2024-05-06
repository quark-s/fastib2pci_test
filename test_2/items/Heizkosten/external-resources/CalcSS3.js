(function(window) {	
	'use strict';
	 
	var calcSS3 = document.querySelector('.calc-main'),
		// display things
		display = calcSS3.querySelector('.calc-display span'),
		logline = calcSS3.querySelector('.calc-log'),
		radDeg = calcSS3.querySelector('.calc-rad'),
		smallerButton = calcSS3.querySelector('.calc-smaller'),
		hold = calcSS3.querySelector('.calc-hold'),
		lnButton = calcSS3.querySelector('.calc-ln'),
		helpButton = calcSS3.querySelector('.calc-info'),
		secondKeySet = [].slice.call(calcSS3.querySelector('.calc-left').children, 12, 20),
		hiddenCopy = calcSS3.querySelector('textarea'),
		degButton = calcSS3.querySelector('.deg'),
		radButton = calcSS3.querySelector('.rad'),
		
		isError,
		pressedKey,
		frozenKey, // active calculation keys
		secondActive = false, // 2nd key active?
		bracketKey,
		brackets = 0, // count of current open brackets
		calculator = [], // instances of Calculator
		deg = false, // Deg mode or Rad
		memory = 0,
		resBuffer = '0',
		bigger = false, // app size
		ln = 0,
		buffStr = [],
		sav = ['secondActive', 'deg', 'memory', 'buffStr', 'resBuffer'],
		keyBoard = {},
		secondLayer = [
			['sin', 'cos', 'tan', 'ln', 'sinh', 'cosh', 'tanh', 'e<sup>x</sup>'],
			[
				'sin<sup>-1</sup>',  'cos<sup>-1</sup>',  'tan<sup>-1</sup>',  'log<sub>2</sub>',
				'sinh<sup>-1</sup>', 'cosh<sup>-1</sup>', 'tanh<sup>-1</sup>', '2<sup>x</sup>'
			]
		],
		Calculator = function() { // for every '(' a new instance
			this.stack = [],
			this.num = 0,
			this.res = 0,
			this.buff = [false, false];

			this.curr = true;

			this.rank = {
				'=': 0,
				'+': 1, '-': 1,
				'/': 2, '*': 2,
				'yx': 3, 'x√y': 3, 'EE': 3
			};
		};			

	Calculator.prototype.calc = function(key, val) {
		var rank = this.rank;

		if (key === '%') {
			this.curr = 'funk';
			return (this.stack[0] ? this.stack[this.num - 1][0] / 100 * val : val / 100) + '';
		}
		key = key.replace('×', '*').replace('÷', '/').replace('–', '-');
		if (key !== '=') {
			this.buff[1] = key;
		} else if (this.buff[0] === false) {
			this.buff[0] = val; // feed buffer for repeating '='
		}
		if (key === '=' && !this.stack[0] && this.curr && this.buff[1]) { // repeating '='
			return (this.buff[1] === 'yx' ? Math.pow(val, this.buff[0]) : this.buff[1] === 'x√y' ?
				/*Math.pow(val, 1 / this.buff[0])*/ nthroot(val, this.buff[0]) : [1] === 'EE' ? val * Math.pow(10, this.buff[0]) :
				eval('(' + val + ')' + this.buff[1] + '(' + this.buff[0] + ')')) + '';
		}
		if (!this.stack[0] && key !== '=') { // first filling
			this.buff[0] = false;
			this.stack[this.num++] = [val, key];
			this.curr = true;
			return val + '';
		}
		if (this.stack[0] && this.curr && this.curr !== 'funk' && key !== '=') { // retyping / correcting operant
			this.stack[this.num - 1] = [val, key];
			return val + ''
		}
		if (!this.stack[0]) {
			return val + '';
		}
		if (rank[key] <= rank[this.stack[this.num - 1][1]]) {
			this.stack[this.num - 1] = [
				this.stack[this.num - 1][1] === 'yx' ? Math.pow(this.stack[this.num - 1][0], val) :
				this.stack[this.num - 1][1] === 'x√y' ?/* Math.pow(this.stack[this.num - 1][0], 1 / val)*/ nthroot(this.stack[this.num - 1][0], this.buff[0]) :
				this.stack[this.num - 1][1] === 'EE' ? this.stack[this.num - 1][0] * Math.pow(10, val) :
					eval('(' + this.stack[this.num - 1][0] + ')' + this.stack[this.num - 1][1] + '(' + val + ')'),
				key
			];
		}
		if (rank[key] > rank[this.stack[this.num - 1][1]]) {
			this.stack[this.num++] = [val, key];
		} else if (this.stack[this.num - 2] && rank[key] <= rank[this.stack[this.num - 2][1]]) {
			this.calc(key, this.stack[--this.num][0]);
		}
		this.res = (this.stack[this.num - 1] ? this.stack[this.num - 1][0] : this.res) + '';
		if (key === '=') {
			this.init('AX');
		}
		this.curr = true;
		return this.res;
	};

	Calculator.prototype.init = function(key) {
		if (key.match(/A/)) {
			this.stack = [];
			this.num = 0;
		};
		if (key === 'AC') {
			this.buff = [false, false];
		}
		return '0';
	};


	// ---------- INIT... ---------- //

	 hiddenCopy.focus(); // for Chrome extention only

	// colloect all keys...
	for (var l = calcSS3.children[2], m = l.children, n = m.length; n--; ) {
		keyBoard[l.children[n].textContent.replace(/\s*/g, '')] = l.children[n];
	}

	
	keyBoard['2x'] = keyBoard['ex'];


	calculator[0] = new Calculator();
	
	// recover after reload or crash...
	/*
	(function(localStorage) {
		if (!localStorage || !localStorage['resBuffer']) {
			return; // for the very first run or after fatal crash
		}
		bigger = localStorage['bigger'] ? eval(localStorage['bigger']) : true;
		toggleCalc();
		if (+localStorage['ln']) {
			ln = localStorage['ln'];
			switchGrouping();
		}
		try {
			if (localStorage['secondActive'].match(/false|null/) ? false : true) {
				keyDown(false, keyBoard['2nd']);
				doKey('2nd', true);
			}
			if (eval(localStorage['deg'])) doKey('Deg', true);
			if (localStorage['memory']) {
				render(localStorage['memory']);
				doKey('m+', true);
			}
			render(localStorage['resBuffer']);
			var buffStrX = localStorage['buffStr'].split(',');
			for (var n = 0, m = buffStrX.length; n < m; n++) {
				if (buffStrX[n]) doKey(buffStrX[n], true);
			}
			render(localStorage['resBuffer']);
			resBuffer = localStorage['resBuffer'];
		} catch (e) {
			for (var n = sav.length; n--;) {
				localStorage.removeItem(sav[n]);
			}
		}
	})(window.localStorage);
   */
   
	// ---------------- event listeners keys ---------------- //

	document.addEventListener('keypress', function(e) {
		var key = e.which,
			holdKey = hold.textContent,
			keyMatch = (',|.|-|–|/|÷|*|×|#|+/–|x|x!|E|EE|e|ex| |2nd|r|x√y|R|√|p|π|^|yx|\'|yx|"|yx|m|mr|v|mc|b|m+|n|m-|' +
				's|sin|c|cos|t|tan|S|sin-1|C|cos-1|T|tan-1|d|Deg|°|Deg|l|ln|L|log|\\|1/x|X|2x').split('|'),
			keyMatchHold = ('sin|sinh|cos|cosh|tan|tanh|m-|Rand|Deg|Rand|sin-1|sinh-1|cos-1|cosh-1|tan-1|tanh-1|' +
				'1|1/x|2|x2|3|x3|x√y|√|ln|log2|ex|2x').split('|');

		if (key === 13) key = 61;
		key = String.fromCharCode(key);
		for (var n = 0, m = keyMatch.length; n < m; n = n + 2)
			if (key === keyMatch[n]) {
				key = key.replace(key, keyMatch[n + 1]);
				break
			}
		if (holdKey) {
			for (var n = 0, m = keyMatchHold.length; n < m; n = n + 2)
				if (key == keyMatchHold[n]) {
					key = key.replace(key, keyMatchHold[n + 1]);
					break
				}
			hold.textContent = '';
		}
		if ((key === 'h' || key === 'H') && !holdKey) hold.textContent = 'Hold';
		if (key === 'G' && holdKey) switchGrouping(true);
		if (!keyBoard[key]) return false;
		if ((key.match(/-1$|log2$|2x$/) && !secondActive) || (key.match(/h$|n$|cos$|ex$/) && secondActive)) {
			keyDown(false, keyBoard['2nd']);
			doKey('2nd', true);
		}
		keyDown(false, keyBoard[key]);
		doKey(key, true);
	}, false);

	document.addEventListener('keydown', function(e) {
		/*var str = resBuffer.replace(/\s/g, ''),
			strLen = str.split('').length - 1;*/

		toggleOptions();
		if (e.which === 8 && calculator[brackets].curr !== true &&
			calculator[brackets].curr !== 'funk' /*&& str !== '0'*/) {
			e.preventDefault();
			backButton();
			/*
			while (buffStr.length && !keyBoard[buffStr[buffStr.length - 1]]) { // bull shit key(s)
				buffStr.pop(); renderHistory("back");
			}
			if (buffStr[buffStr.length - 1] === '+/–') {
				doKey('+/–', true);
				buffStr.pop(); renderHistory("back");
			} // +/-
			else if (resBuffer.match(/\-\d$/) || resBuffer.match(/^\d$/)) {
				buffStr.pop(); renderHistory("back");
				doKey('C', true);
				render('0');
			} else {
				render(str.substring(0, strLen), true);
			}
			buffStr.pop(); renderHistory("back");
			if (buffStr[buffStr.length - 1] === '.') {
				render(str.substring(0, strLen - 1));
				buffStr.pop();  renderHistory("back"); 
			}
			*/
		}
		if (e.which === 220) {
			keyDown(false, keyBoard['xy']);
		}
		if (e.which === 46) {
			keyDown(false, keyBoard['AC']);
			doKey(keyBoard['AC'].textContent, true);
		}
		if (e.which === 9) {
			// UK: Deactivate small version --> No TOGGLE ;-)
			//toggleCalc(true);
			e.preventDefault();
		}
	}, false);

	document.addEventListener('keyup', function() {
		keyUp();
		saveState();
	}, false);

	document.body.addEventListener('paste', function(e) {
		render(parseFloat(e.clipboardData.getData("Text") + '') + '');
		calculator[brackets].curr = true;
		//keyBoard['AC'].children[0].firstChild.data = 'C';
		if (frozenKey) freezeKey(frozenKey, true);
		e.preventDefault();
	}, false);

	document.body.addEventListener('copy', function(e) {
		hiddenCopy.textContent = resBuffer.replace(/\s/g, '');
		hiddenCopy.focus();
		hiddenCopy.select();
	}, false);

	// ---------------- event listeners mouse --------------- //

	calcSS3.onmousedown = function(e) {
		keyDown(e);
		if (!pressedKey) return false;
		document.addEventListener('mouseout', keyUp, false);
		document.addEventListener('mouseover', keyDown, false);
		return false;
	}

	/*************** FW: Focus fix ***************/
	
		var refreshFocus = function(e) {
			hiddenCopy.focus();
			return false;
		};
		
		// ... unfortunately, Itembuilder-DIVs don't have class names or IDs. 
		// So we have to fetch all of them into an array and look for the drag-drop container, which is on index 64 :-)
		
		window.onload = function(){
			var divs = window.parent.document.getElementsByTagName("div");
			//console.log(divs, divs.length);
			if(divs && divs.length > 20){
				if(typeof divs[divs.length-19] != "undefined"){
					divs[divs.length-19].addEventListener('mouseup', refreshFocus, false);
				}
			}
		}
		
		
		document.body.addEventListener('mouseover', refreshFocus, false);
		
		hiddenCopy.addEventListener('blur', function(e) {
			calcSS3.classList.add('disabled');
			return false;
		}, false);

		hiddenCopy.addEventListener('focus', function(e) {
			calcSS3.classList.remove('disabled');
			return false;
		}, false);	
		
				
	/*************** //Focus fix ***************/
	
	document.addEventListener('mouseup', function(e) {
		//document.body.focus();
		hiddenCopy.focus();
		var event = e || window.event,
			target = getTargetKey(event.target),
			keyText = target.textContent.replace(/\s*/g, ''),
			key = keyBoard[keyText];

		if (event.target === helpButton) {
			//window.location = 'http://dematte.at/calculator#usage';
		}
		if (event.target === smallerButton) {
			//toggleCalc(true);
		}
		if (event.target === lnButton) {
			//switchGrouping(true);
		}
		if (event.target !== lnButton) {
			//toggleOptions();
		}
		document.removeEventListener('mouseout', keyUp, false);
		document.removeEventListener('mouseover', keyDown, false);
		if (!pressedKey) {
			return false;
		}
		if (key) {
			doKey(keyText);
			saveState();
		}
	}, false);

	display.parentElement.addEventListener('dblclick', function() {
		/*if (!helpButton.active) {
			toggleCalc(true);
		}*/
		
		
	}, false);

	helpButton.addEventListener('mouseover', function() {
		toggleOptions(true);
	}, false);

	
	var fnDegRadToggle = function (e) {
		doKey(e.target.id);
	}	
		
	degButton.addEventListener('click', fnDegRadToggle, false);
	radButton.addEventListener('click', fnDegRadToggle, false);
	
	// ------------------- event related functions ------------------ //
	
	function backButton(){
			
			var str = resBuffer.replace(/\s/g, ''),
			strLen = str.split('').length - 1;	
			while (buffStr.length && !keyBoard[buffStr[buffStr.length - 1]]) { //
				buffStr.pop(); renderHistory("back");
			}
			if (buffStr[buffStr.length - 1] === '+/–') {
				doKey('+/–', true);
				buffStr.pop(); renderHistory("back");
			} // +/-
			else if (resBuffer.match(/\-\d$/) || resBuffer.match(/^\d$/)) {
				buffStr.pop();
				//doKey('C', true);
				render('0');
			} else {
				render(str.substring(0, strLen), true);
			}
			buffStr.pop(); renderHistory("back");
			if (buffStr[buffStr.length - 1] === '.') {
				render(str.substring(0, strLen - 1));
				buffStr.pop();  renderHistory("back"); 
			}
	}
	
	function keyDown (e, obj) { // works for mouse and key
		var event = e || window.event,
			target = obj || getTargetKey(event.target),
			keyText = target.textContent.replace(/\s*/g, ''),
			key = keyBoard[keyText];

		if (key) {
			keyUp(); // recover key in case of a javaScript Error
			pressedKey = key;
			key.className = key.className + ' calc-press';
		}
		return false;
	}

	function getTargetKey(elm) {
		while (elm !== calcSS3 && elm.parentNode && elm.parentNode.style &&
				!/calc-(?:left|right)/.test(elm.parentNode.className)) {
			elm = elm.parentNode;
		}
		return elm;
	}

	function keyUp() {
		if (pressedKey && pressedKey !== secondActive) {
			pressedKey.className = pressedKey.className.replace(' calc-press', '');
			pressedKey = null;
		}
	}

	function freezeKey(key, del) {
		var obj = (!del || del !== 2) ? frozenKey : key;
		if (obj) obj.className = obj.className.replace(' calc-active', '');
		if (!del) {
			key.className = key.className + ' calc-active';
			frozenKey = key;
		}
		return obj;
	}

	function saveState() {
		
		/*for (var n = sav.length; n--;) {
				[sav[n]] = eval(sav[n]); // oooohhhh, outch...
		}*/
	}

	function toggleOptions(doIt) {
		helpButton.active = !!doIt;
	}

	function toggleCalc(doIt) {
		var cName = calcSS3.className;

		if (doIt) {
			bigger = !bigger;
		}
		localStorage['bigger'] = bigger;
		calcSS3.className = bigger ?
			cName.replace(' calc-small', '') :
			cName + ' calc-small';
		smallerButton.firstChild.data = bigger ? '>' : '<';
		render(resBuffer);
	}

	function switchGrouping(doIt) {
		if (doIt) {
			ln = ++ln > 3 ? 0 : ln;
		}
		lnButton.firstChild.data = !ln ? '.' : ln === 1 ? ',' : ln === 2 ? ',.' : '.,';
		render(resBuffer);
		localStorage['ln'] = ln;
	}

	function render(val, inp) {
		var regx = /(\d+)(\d{3})/,
			hasComma = val.match(/\./),
			tmp,
			valAbs = Math.abs(+val),
			fontSize = 40,
			displayStyle = display.style,
			displayParentStyle = display.parentNode.style;

		if (val.match(/NaN|Inf|Error/)) {
			tmp = 'Fehler';
			resBuffer = "Error";
			isError = true;
			//doKey("AC");
			//return 'Fehler';
		} else {
			resBuffer = val;
			if (valAbs >= 1e+16) {
				val = (+val).toExponential(13) + '';
			}
			if (!bigger && ((!inp || inp === '+/–') && valAbs !== 0)) {
				val = (+val).toPrecision(9);
			}
			tmp = (val + '').split('.');
			if (tmp[1]) {
				tmp[2] = tmp[1].split('e');
				if (tmp[2][1]) {
					tmp[1] = tmp[2][0];
				}
				if (!inp || inp === '+/–') {
					tmp[1] = (((+('1.' + tmp[1])).toPrecision(bigger ? 16 : tmp[2][1] ? 7 : 9)) + '');
					if (tmp[1] >= 2) {
						tmp[0] = (+tmp[0] + 1) + '';
					}
					tmp[1] = tmp[1].substr(2).replace(/0+$/, '');
				}
			}
			/*while (regx.test(tmp[0])) {
				tmp[0] = tmp[0].replace(regx, '$1' + "<span style=\"font-size: 20px:\">&nbsp;</span>" + '$2');
			}*/
			tmp = tmp[0] + ((tmp[1] || hasComma) ? '.' + tmp[1] : '').
				replace('.undefined', '').
				replace(inp ? '' : /\.$/, '') + (tmp[2] && tmp[2][1] ? 'e' + tmp[2][1] : '');
		}
		if (ln) {
			tmp = tmp.replace(/\./g, '#').
				replace(/\s/g, ln === 1 ? ' ' : ln === 2 ? ',' : '.').
				replace(/#/g, ln === 2 ? '.' : ',');
		}
		display.firstChild.data = tmp;
		// for common use: get values of pixels dynamically to stay free from design (...but outside this function)
		displayStyle.fontSize = '40px';
		displayParentStyle.lineHeight = '61px';
		while (display.offsetWidth > display.parentNode.offsetWidth - (bigger ? 40 : 30)) {
			displayStyle.fontSize = (fontSize--) + 'px';
			displayParentStyle.lineHeight = (fontSize + 18) + 'px'
		}
		return tmp;
	}

	function doKey(text, alt) {
				
		var key = keyBoard[text]; // text = key.textContent.replace(/\s*/g, '');
		
		if(isError && text !== "AC" && text !== "C")
			return;
		
		isError = false;
		
		if (text === '2nd') {
			secondActive = secondActive ? null : true;
			key.className = secondActive ? 'calc-press calc-second' : ''; // !!!
			for (var n = secondKeySet.length; n--; ) {
				secondKeySet[n].children[0].innerHTML = secondLayer[secondActive ? 1 : 0][n];
			}
		} else if (text.match(/^[+|–|÷|×|yx|x√y|E]+$/) && text !== '√') {
			freezeKey(key);
		} else if (text.match(/^[\d|\.|π]$/)) {
			freezeKey(key, true);
			//keyBoard['AC'].children[0].firstChild.data = 'C';
		} else if (text === 'C') {
			//key.children[0].firstChild.data = 'AC';
			if (frozenKey) freezeKey(frozenKey);
		} else if (text.match(/AC|=/)) {
			if (bracketKey) freezeKey(bracketKey, 2);
			freezeKey(key, true);
			frozenKey = null
		} else if (text.match(/Deg|Rad/)) {
			radDeg.firstChild.data = text;
			deg = text == "Rad" ? false : true;
			hiddenCopy.focus();
			//radDeg.firstChild.data = deg ? 'Rad' : 'Deg';
			//key.children[0].firstChild.data = deg ? 'Deg' : 'Rad';			
			//deg = !deg
		} else if (text === '(') {
			bracketKey = key;
			freezeKey(bracketKey, 2).className += ' calc-active';
		} else if (text === ')' && brackets === 1 && bracketKey) {
			freezeKey(bracketKey, 2);
		} else if (text.match(/^mr$/) && memory) {
			//keyBoard['AC'].children[0].firstChild.data = 'C';
		}

		evalKey(text);
		
		if (!alt) {
			keyUp();
		}
		if (text.match(/^m[c|+|-]/)) {
			freezeKey(keyBoard['mr'], 2).className += (memory ? ' calc-active' : '');
		}
		//console.log(resBuffer);
	}

	function evalKey(key) {
		var dispVal = resBuffer.replace(/\s/g, '').replace(/Error|∞|-∞/, '0') + '',
			_PI = Math.PI,
			lastKey;
				
		if(key == '←'){
			/*var str = resBuffer.replace(/\s/g, ''),
					strLen = str.split('').length - 1;	*/
					
			if (calculator[brackets].curr !== true &&
			calculator[brackets].curr !== 'funk' /*&& str !== '0'*/) {
				backButton();
			}
			return;
		}
		
		if(key == "mr" && memory){			
			let _mem = memory + '';
			for(let i = 0; i < _mem.length; i++){								
				evalKey(_mem[i]);
			}
			return;
		}
			
		if (!key.match(/2nd|Deg|Rad|m/)) { // +/- issue
			buffStr.push(key);			
			if ((buffStr[buffStr.length - 2] === '=' && key !== '=' &&
					calculator[brackets].curr) || key === 'AC') {
				buffStr = [key];
			}
		}
		
		lastKey = buffStr[buffStr.length - 2];
		var regex0 =  new RegExp ('(sin-1|cos-1|tan-1|sinh|cosh|tanh|sinh-1|cosh-1|tanh-1|sin|cos|tan|ln|log|log2|3√y|2√y|1/x|ex|e^|3#Wurzel|Wurzel|x2|x3)');
				
		
		if (key.match(/^[\d|\.]$/) || key === '+/–') {
			if (calculator[brackets].curr && key !== '+/–' || (key === '+/–' &&
					lastKey && lastKey.match(/^[+|–|÷|×|yx|x√y|E|^C]+$/))) {
				dispVal = '0';
				calculator[brackets].curr = false;
								
				if(lastKey && lastKey.match(regex0))
					renderHistory("AC", "0");
			}
			if ((Math.abs(+(dispVal + key)) > (bigger ? 1e15 : 1e9) ||
					dispVal.replace(/^-/, '').length > 15 ||
					(dispVal.replace('-', '').replace(/\./g, '').length > (bigger ? 14 : 8)) ||
					(dispVal.match(/\.|\e\+/) && key === '.')) && key !== '+/–') {
				buffStr.pop();
				return;
			} else if (key === '+/–') {
				render(!(dispVal.replace(/e[\+|\-]/, '')).match('-') ?
					'-' + dispVal : dispVal.replace(/^-/, ''), '+/–');

			} else {
				render((dispVal + key).replace(/^(-)*?0(\d)$/, '$1' + '$2'), true);
			}
		} else if (key.match(/^C|AC/)) {
			render(calculator[brackets].init(key));
			hold.textContent = '';
		} else if (key.match(/^[+|–|÷|×|-|\/|*|yx|x√y|%|E]+$/) && key !== '√') {
			let val = dispVal;
			if(lastKey == "(" && key.match(/^[+|–|×|-|*]+$/))
				val = 0;
			render(calculator[brackets].calc(key, val));
		} else {
			if (brackets > -1) {
				calculator[brackets].curr = 'funk';
			}
			switch (key) {
				case '=':
					while (brackets > -1) {
						render(dispVal = calculator[brackets--].calc('=', dispVal));
					}
					brackets = 0;
					calculator[brackets].curr = true;
					break;
				case '(':
					calculator[++brackets] = new Calculator();
					calculator[brackets].curr = true;
					break;
				case ')':
					if (brackets) {
						render(calculator[brackets--].calc('=', dispVal));
					}
						
					if (brackets > -1) {
						calculator[brackets].curr = false;
					}
					break;
				case 'mc':
					memory = 0;
					break;
				case 'm+':
					memory += +dispVal;
					break;
				case 'm-':
					memory -= +dispVal;
					break;
				case '1/x':
					render((1 / dispVal) + '');
					break;
				case 'x2':
					render(Math.pow(dispVal, 2) + '');
					break;
				case 'x3':
					render(Math.pow(dispVal, 3) + '');
					break;
				case 'x!':
					render((function fak(n) {
						//console.log(n, isInt(n));*
						return n < 0 || n > 170 || !isInt(n) ? NaN : n <= 1 ? 1 : n * fak(n - 1)
					})(/*Math.round(+dispVal)*/dispVal) + '');
					break;
				case '√':
				case '2√y':
					render(Math.sqrt(dispVal) + '');
					break;
				case '3√y':	
					 render(String(nthroot(dispVal, 3)));
					 break;
				case 'log':
					render(Math.log(dispVal) / Math.log(10) + '');
					break;
				case 'sin':
					render(!deg && Math.abs(dispVal) === _PI ? '0' :
						Math.sin(dispVal * (deg ? _PI / 180 : 1)) + '');
					break;
				case 'sin-1':
					render(Math.asin(dispVal) * (deg ? 180 / _PI : 1) + '');
					break;
				case 'cos':
					render(Math.cos(dispVal * (deg ? _PI / 180 : 1)) + '');
					break;
				case 'cos-1':
					render(Math.acos(dispVal) * (deg ? 180 / _PI : 1) + '');
					break;
				case 'tan':
					render(!deg && Math.abs(dispVal) === _PI ? '0' :
						Math.tan(dispVal * (deg ? _PI / 180 : 1)) + '');
					break;
				case 'tan-1':
					render(Math.atan(dispVal) * (deg ? 180 / _PI : 1) + '');
					break;
				case 'ln':
					render(Math.log(dispVal) + '');
					break;
				case 'log2':
					render(Math.log(dispVal) / Math.log(2) + '');
					break;
				case 'sinh':
					render(((Math.pow(Math.E, dispVal) - Math.pow(Math.E, -dispVal)) / 2) + '');
					break;
				case 'sinh-1':
					render(Math.log(+dispVal + Math.sqrt(1 + Math.pow(dispVal, 2))) + '');
					break;
				case 'cosh':
					render(((Math.pow(Math.E, dispVal) + Math.pow(Math.E, -dispVal)) / 2) + '');
					break;
				case 'cosh-1':
					render(2 * Math.log(Math.sqrt((+dispVal + 1) / 2) + Math.sqrt((+dispVal - 1) / 2)) + '');
					break;
				case 'tanh':
					(function(e1, e2) {
						render((e1 - e2) / (e1 + e2) + '');
					})(Math.pow(Math.E, dispVal), Math.pow(Math.E, -dispVal));
					break;
				case 'tanh-1':
					render((Math.log(+dispVal + 1) - Math.log(1 - dispVal)) / 2 + '');
					break;
				case 'ex':
					render(Math.exp(dispVal) + '');
					break;
				case '2x':
					render(Math.pow(2, (dispVal)) + '');
					break;
				case 'π':
					render(_PI + '');
					break;
				case 'Rand':
					render(Math.random() + '');
					break;
				default:
					// buffStr.pop();
					break;
			}
		}
		
		//console.log("buffStr: " + buffStr);
		
		if(resBuffer == "Error"){
			resBuffer = "0";
			renderHistory("AC");
			return;
		}
		
		var _dispVal = resBuffer.replace(/\s/g, '').replace(/Error|∞|-∞/, '0') + '';
		renderHistory(key, _dispVal);
		
		logline.scrollLeft = logline.scrollWidth;
	}
	
	function nthroot(x, n) {
	  try {
		var negate = n % 2 == 1 && x < 0;
		if(negate)
		  x = -x;
		var possible = Math.pow(x, 1 / n);
		n = Math.pow(possible, n);
		if(Math.abs(x - n) < 1 && (x > 0 == n > 0))
		  return negate ? -possible : possible;
	  } catch(e){}
	}
	
	
	function isInt(n) {
		return n % 1 === 0;
	}
	
	function renderHistory(key, dispVal){		
		
		var tmp = "";
		logline.textContent = "";
		
		if ( typeof renderHistory.logstr == 'undefined' || key.match(/^C|AC|=/) )
			renderHistory.logstr = [];

		if ( typeof renderHistory.dispval == 'undefined' || key.match(/^C|AC|=/) )
			renderHistory.dispval = [];
				
		
		var len = renderHistory.logstr.length;
		var prevKey = (len > 0) ? renderHistory.logstr[len-1] : null;
		var prevKey2 = (len > 1) ? renderHistory.logstr[len-2] : null;
		var append = true;
		
		if(prevKey != null){
			
			//...Operatoren nicht mehrfach in Folge loggen / letzer ersetzt vorigen
			if(prevKey.match(/^(\+|–|÷|×|yx|x√y|E)+$/) && key.match(/^(\+|–|÷|×|yx|x√y|E)+$/)){
				renderHistory.logstr[len-1] = key;
				append = false;
			}
			
			else if(key == "back"){
				
				if(prevKey.match(/^(\.|\d|\(|\))/))
				{
					renderHistory.logstr.pop();
				}				
				
				append = false;
			}			
		}		
		
		if (append && !key.match(/2nd|Deg|Rad|m|C|AC/)){
			renderHistory.logstr.push(key);
			if(key=="π" || (len > 0 && renderHistory.dispval[len-1] === "-π" && key === "+/–")){
				renderHistory.dispval.push("π");
			}
			else if(renderHistory.dispval[len-1] === "π" && key === "+/–"){
				renderHistory.dispval.push("-π");
			}
			else if(key !== "="){
				renderHistory.dispval.push(dispVal);
			}
		}
				
				
		if(renderHistory.logstr.length){		
				
			var _brackets = 0;
			
			for(var i=0; i<renderHistory.logstr.length; i++){
				
					var _key = renderHistory.logstr[i];
					var _prevKey = i>0 ? renderHistory.logstr[i-1] : null;
					var _nextKey = i<renderHistory.logstr.length-1 ? renderHistory.logstr[i+1] : null;					
												
					if (_key == "=" && typeof dispVal != "undefined"){
							tmp = dispVal;
							renderHistory.logstr = ["="+dispVal];
							//renderHistory.logstr = [dispVal];
							break;
					}
					
					else if(_key.match(/^=-?\d/)){
						if(_nextKey != null && !isNaN(_nextKey)){
							tmp = _nextKey;
							renderHistory.logstr = [_nextKey];
							break;
						}
						else
						{
							tmp = _key.substr(1);
							renderHistory.logstr[i] = tmp;
						}
					}
					
					else if(_key == "π"){
						if(_nextKey != null && !isNaN(_nextKey)){
							tmp = _nextKey;
							renderHistory.logstr = [_nextKey];
							break;
						}
						else
							tmp += "π";
					}						
					
					else if(_key == "("){
						_brackets++;
						tmp += "(";
					}						
					
					else if(_key == ")"){
						if(_brackets>0){
							tmp += ")";
							_brackets--;
						}
						else{
							continue;
						}
					}						
											
											
					else if(_key == "÷"){
						tmp += "/";
					}

					else if(_key == "x3"){
						tmp += "^3";
					}						
					
					else if(_key == "x2"){
						tmp += "^2";
					}
					
					else if(_key == "yx"){
						tmp += "^";
					}						
					
					else if(_key == "x√y"){
						tmp += " xWurzel ";
					}	
					
					else if(_key == "back"){						
						tmp += "";
					}
					
					else if(_key == "x!"){						
						tmp += "!";
						let regex =  new RegExp ("(-?[0-9π!.]+|\\(.+\\))!", "g");
						let match = tmp.match(regex);
						if(match != null)
							renderHistory.dispval[i] = match[0];
					}					
					
					else if(_key == "+/–"){
						
						//console.log(renderHistory.dispval);
						//console.log(_dispVal,_dispVal_0);
						
						var _dispVal = renderHistory.dispval[i].toString();
						var _dispVal_0 = (i>0) ? renderHistory.dispval[i-1].toString() : false;						
						
						if(_dispVal_0 !== false){
							var _pos = tmp.lastIndexOf(_dispVal_0);
							if(_pos >= 0){
								var tmp_1 = tmp.substr(0, _pos);
								var tmp_2 = tmp.substr(_pos + _dispVal_0.length);							
								tmp = tmp_1 + _dispVal + tmp_2;
							}
						}
					}
					
					
					else
						tmp += renderHistory.logstr[i];
					
					
				//fn(x)						
					var regstr = "sin-1|cos-1|tan-1|sinh|cosh|tanh|sinh-1|cosh-1|tanh-1|sin|cos|tan|ln|log|log2|3√y|2√y|x√y|1/x|ex|e^|3WurzeI|Wurzel";
					var regex0 =  new RegExp ('('+regstr+')');

					if(_key.match(regex0)){
						
						if(_prevKey == null)
							tmp = "0"+tmp;
						
						var regex1 =  new RegExp ("(-?[0-9π!.]+|\\(.+\\))("+regstr+")", "g");
						if(_prevKey != null && _prevKey.match(regex0))
							regex1 =  new RegExp ("("+_prevKey+"\\(.+\\))("+regstr+")", "g");
						
						tmp = tmp.replace(regex1, 
							function(str,p1,p2){
								var ret = "";
								if (p2 == "3√y" || p2 == "3WurzeI"){
									ret = "3WurzeI("+p1+")";
									renderHistory.logstr[i] = "3WurzeI";
								}								
								else if(p2 == "√" || p2 == "2√y" || p2 == "Wurzel"){
									ret = "Wurzel("+p1+")";
									renderHistory.logstr[i] = "Wurzel";
								}
								else if (p2 == "1/x"){
									ret = "1/"+p1;
								}
								else if (p2 == "ex"){
									ret = "e^("+p1+")";	
									renderHistory.logstr[i] = "e^";									
								}
								else{
									ret = p2+"("+p1+")";
								}
								
								renderHistory.dispval[i] = ret;								
								
								return ret;
							}
						);
					}
			}
			
			logline.textContent = tmp;
			
		}
					
	}
	
})(window);