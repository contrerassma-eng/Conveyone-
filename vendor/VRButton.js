// VRButton (WebXR) — equivalente al examples/js/webxr/VRButton.js de three.js r128, como
// global THREE.VRButton (sin módulos). Etiquetas en español y, si el dispositivo NO soporta
// 'immersive-vr', el botón se OCULTA (en vez de mostrar "NOT SUPPORTED") para no ensuciar la UI.
(function () {
	'use strict';

	var VRButton = {

		createButton: function (renderer) {

			var button = document.createElement('button');
			button.id = 'VRButton';
			button.style.display = 'none';

			function showEnterVR() {

				var currentSession = null;

				function onSessionStarted(session) {
					session.addEventListener('end', onSessionEnded);
					renderer.xr.setSession(session);
					button.textContent = 'SALIR VR';
					currentSession = session;
				}

				function onSessionEnded() {
					currentSession.removeEventListener('end', onSessionEnded);
					button.textContent = 'ENTRAR VR';
					currentSession = null;
				}

				button.style.display = '';
				button.style.cursor = 'pointer';
				button.textContent = 'ENTRAR VR';

				button.onmouseenter = function () { button.style.opacity = '1.0'; };
				button.onmouseleave = function () { button.style.opacity = '0.85'; };

				button.onclick = function () {
					if (currentSession === null) {
						// 'local-floor': el piso real = y de referencia (la planta está a escala 1:1 en metros)
						var sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
						navigator.xr.requestSession('immersive-vr', sessionInit).then(onSessionStarted);
					} else {
						currentSession.end();
					}
				};
			}

			if ('xr' in navigator) {
				navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
					if (supported) showEnterVR();
					else button.style.display = 'none';   // sin soporte VR: no mostrar nada
				}).catch(function () { button.style.display = 'none'; });
			}

			return button;
		}
	};

	if (typeof THREE !== 'undefined') THREE.VRButton = VRButton;
	if (typeof window !== 'undefined') window.VRButton = VRButton;
})();
