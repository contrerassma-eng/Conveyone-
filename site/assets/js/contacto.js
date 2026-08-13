/* contacto.js — validación y envío del formulario de contacto.
   Sin backend: se redacta el correo con los datos ya ordenados. */

const DESTINO = 'scontreras@conveyone.tech';
const $ = (id) => document.getElementById(id);

const TIPOS = {
  equipo: 'Un equipo puntual',
  linea: 'Una línea completa',
  ampliacion: 'Ampliar o modificar una línea existente',
  ingenieria: 'Solo ingeniería / simulación',
  repuestos: 'Repuestos y mantención',
};

// contacto.html?eq=<slug> llega desde una tarjeta del catálogo
const eq = new URLSearchParams(location.search).get('eq');
if (eq) {
  $('tipo').value = 'equipo';
  $('msg').value = `Me interesa el equipo "${eq}". `;
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  let ok = true;
  ['nombre', 'empresa', 'email', 'msg'].forEach((k) => {
    const el = $(k);
    const malo = !el.value.trim() || (k === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value));
    el.closest('.field').classList.toggle('err', malo);
    if (malo) ok = false;
  });
  if (!ok) {
    aviso('Faltan datos para poder responderte. Revisa los campos marcados.', false);
    return;
  }

  const L = [
    'CONTACTO DESDE CONVEYONE.TECH',
    '',
    `Nombre:   ${$('nombre').value.trim()}`,
    `Empresa:  ${$('empresa').value.trim()}`,
    `Correo:   ${$('email').value.trim()}`,
  ];
  if ($('fono').value.trim()) L.push(`Teléfono: ${$('fono').value.trim()}`);
  L.push(`Tipo:     ${TIPOS[$('tipo').value] || $('tipo').value}`);
  L.push('', 'REQUERIMIENTO', $('msg').value.trim());

  const asunto = `Contacto — ${$('empresa').value.trim()} (${TIPOS[$('tipo').value]})`;
  window.location.href = `mailto:${DESTINO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(L.join('\n'))}`;
  aviso('Se abrió tu correo con el mensaje redactado. Si no se abrió, escríbenos a scontreras@conveyone.tech.', true);
});

function aviso(txt, ok) {
  const n = $('aviso');
  n.style.display = 'flex';
  n.classList.toggle('ok', !!ok);
  $('avisoTxt').textContent = txt;
}
