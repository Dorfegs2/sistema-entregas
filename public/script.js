const map = L.map('map').setView([-27.64966, -48.67656], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markerA, markerB, rotaLayer;
let rotaInfoGlobal = null;

function resumirEndereco(enderecoCompleto) {
  const partes = enderecoCompleto.split(',');
  return partes.slice(0, 4).join(',').trim(); // Rua, número, bairro
}


function limparMapa() {
  if (markerA) map.removeLayer(markerA);
  if (markerB) map.removeLayer(markerB);
  if (rotaLayer) map.removeLayer(rotaLayer);
}

async function buscarCoordenadas(endereco) {
  const cepRegex = /^\d{5}-?\d{3}$/; // Detecta CEPs com ou sem traço

  let query = endereco;
  if (cepRegex.test(endereco)) {
    query += ', Brasil'; // Força localização correta
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      nomeFormatado: data[0].display_name
    };
  }
  throw new Error('Endereço ou CEP não encontrado: ' + endereco);
}



async function desenharRota(pontoA, pontoB) {
  const apiKey = '5b3ce3597851110001cf6248fb2a1b09d2044e9c85c8e5d8750c7c76';
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

  const body = {
    coordinates: [
      [pontoA.lon, pontoA.lat],
      [pontoB.lon, pontoB.lat]
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Erro OpenRouteService: ' + text);
  }

  const data = await res.json();

  if (rotaLayer) map.removeLayer(rotaLayer);

  rotaLayer = L.geoJSON(data, {
    style: { color: 'blue', weight: 5 }
  }).addTo(map);

  map.fitBounds(rotaLayer.getBounds());

  const segment = data.features[0].properties.segments[0];
  return { distancia: segment.distance, duracao: segment.duration };
}

async function calcularRota() {
  const enderecoA = document.getElementById('enderecoA').value.trim();
  const enderecoB = document.getElementById('enderecoB').value.trim();
  const msgDiv = document.getElementById('mensagem');
  limparMapa();
  msgDiv.textContent = 'Calculando rota...';
  msgDiv.style.color = 'black';

  try {
    const pontoA = await buscarCoordenadas(enderecoA);
    const pontoB = await buscarCoordenadas(enderecoB);

    markerA = L.marker([pontoA.lat, pontoA.lon]).addTo(map).bindPopup('Coleta: ' + pontoA.nomeFormatado).openPopup();
    markerB = L.marker([pontoB.lat, pontoB.lon]).addTo(map).bindPopup('Entrega: ' + pontoB.nomeFormatado).openPopup();

    const rotaInfo = await desenharRota(pontoA, pontoB);

    rotaInfoGlobal = {
      pontoA,
      pontoB,
      distancia: rotaInfo.distancia,
      duracao: rotaInfo.duracao
    };

    const distanciaKm = rotaInfo.distancia / 1000;
    const duracaoMin = rotaInfo.duracao / 60;
    let valorEntrega = 8.0;
    if (distanciaKm > 4) {
      valorEntrega += (distanciaKm - 4) * 1.5;
    }
    const temRetorno = document.getElementById('temRetorno').checked;
    if (temRetorno) {
      valorEntrega += 3.0;
    }

    msgDiv.innerHTML = `
      Distância: ${distanciaKm.toFixed(2)} km<br>
      Duração estimada: ${duracaoMin.toFixed(0)} minutos<br>
      <strong>Valor da entrega: R$ ${valorEntrega.toFixed(2)}</strong>
    `;

    rotaInfoGlobal.valorEntrega = valorEntrega;
    rotaInfoGlobal.temRetorno = temRetorno;
    rotaInfoGlobal.enderecoFormatadoA = pontoA.nomeFormatado;
    rotaInfoGlobal.enderecoFormatadoB = pontoB.nomeFormatado;

    // Preserva o número digitado pelo usuário
function reinserirNumeroEndereco(original, formatado) {
  const match = original.match(/(\d{1,5})/); // busca um número de até 5 dígitos
  if (!match) return formatado;
  const numero = match[1];

  const partes = formatado.split(',');
  if (partes.length > 1) {
    partes[0] = partes[0] + ', ' + numero;
    return partes.join(', ');
  }
  return formatado + ', ' + numero;
}

document.getElementById('enderecoA').value = reinserirNumeroEndereco(enderecoA, pontoA.nomeFormatado);
document.getElementById('enderecoB').value = reinserirNumeroEndereco(enderecoB, pontoB.nomeFormatado);


    document.getElementById('btnWhatsapp').disabled = false;

  } catch (error) {
    msgDiv.textContent = error.message;
    msgDiv.style.color = 'red';
    document.getElementById('btnWhatsapp').disabled = true;
  }

}

function abrirWhatsApp() {
  if (!rotaInfoGlobal) {
    alert('Por favor, calcule a rota antes de enviar o pedido.');
    return;
  }

  const nome = localStorage.getItem('usuario_nome') || 'Cliente';
  const numPedido = document.getElementById('numPedido').value.trim();
  const enderecoAOriginal = document.getElementById('enderecoA').value.trim();
  const enderecoBOriginal = document.getElementById('enderecoB').value.trim();

  if (!numPedido || !enderecoAOriginal || !enderecoBOriginal) {
    alert('Preencha todos os campos antes de enviar.');
    return;
  }

  // Variáveis da rota
  const distanciaKm = (rotaInfoGlobal.distancia / 1000).toFixed(2);
  const duracaoMin = Math.round(rotaInfoGlobal.duracao / 60);
  const valorEntrega = rotaInfoGlobal.valorEntrega.toFixed(2);
  const temRetorno = rotaInfoGlobal.temRetorno;
  const retornoTexto = temRetorno ? 'Retorno: SIM' : 'Retorno: NÃO';

  // Função para reinserir número no endereço formatado
  function reinserirNumeroEndereco(original, formatado) {
    const match = original.match(/(\d{1,5})/);
    if (!match) return formatado;
    const numero = match[1];

    const partes = formatado.split(',');
    if (partes.length > 1 && !partes[0].includes(numero)) {
      partes[0] = partes[0] + ', ' + numero;
      return partes.join(', ');
    }
    return formatado.includes(numero) ? formatado : formatado + ', ' + numero;
  }

  // Função para resumir o endereço pegando 4 partes
  function resumirEndereco(enderecoCompleto) {
    const partes = enderecoCompleto.split(',');
    return partes.slice(0, 4).map(p => p.trim()).join(', ');
  }

  // Reinsere número no endereço formatado
  const enderecoAComNumero = reinserirNumeroEndereco(enderecoAOriginal, rotaInfoGlobal.enderecoFormatadoA);
  const enderecoBComNumero = reinserirNumeroEndereco(enderecoBOriginal, rotaInfoGlobal.enderecoFormatadoB);

  // Resumir endereço para 4 partes
  const enderecoAResumido = resumirEndereco(enderecoAComNumero);
  const enderecoBResumido = resumirEndereco(enderecoBComNumero);

  // Monta a mensagem WhatsApp
  const msg = `*Pedido de Entrega*\n
Nome: ${nome}
Pedido Nº: ${numPedido}
Coleta: ${enderecoAResumido}
Entrega: ${enderecoBResumido}
Distância: ${distanciaKm} km
Duração: ${duracaoMin} minutos
${retornoTexto}
Valor da entrega: R$ ${valorEntrega}`;

  const numeroWhatsApp = '48988131927';
  const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(msg)}`;

  window.open(url, '_blank');
}


document.getElementById('btnCalcular').addEventListener('click', calcularRota);
document.getElementById('btnWhatsapp').addEventListener('click', abrirWhatsApp);
