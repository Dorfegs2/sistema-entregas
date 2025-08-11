const map = L.map('map').setView([-27.64966, -48.67656], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markerA, rotaLayer;
let rotaInfoGlobal = null;

function limparMapa() {
  if (markerA) map.removeLayer(markerA);
  if (rotaLayer) map.removeLayer(rotaLayer);
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer !== markerA) {
      map.removeLayer(layer);
    }
  });
}

async function buscarCoordenadas(endereco) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco + ', Brasil')}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.length === 0) throw new Error(`Endereço não encontrado: ${endereco}`);
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    nomeFormatado: data[0].display_name
  };
}

async function desenharRotaMultiplos(pontos) {
  const apiKey = '5b3ce3597851110001cf6248fb2a1b09d2044e9c85c8e5d8750c7c76';
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

  const coords = pontos.map(p => [p.lon, p.lat]);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ coordinates: coords })
  });

  if (!res.ok) throw new Error('Erro OpenRouteService: ' + await res.text());

  const data = await res.json();

  if (rotaLayer) map.removeLayer(rotaLayer);
  rotaLayer = L.geoJSON(data, {
    style: { color: 'blue', weight: 5 }
  }).addTo(map);

  map.fitBounds(rotaLayer.getBounds());

  return {
    distancia: data.features[0].properties.summary.distance,
    duracao: data.features[0].properties.summary.duration
  };
}

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

function resumirEndereco(enderecoCompleto) {
  const partes = enderecoCompleto.split(',');
  return partes.slice(0, 4).map(p => p.trim()).join(', ');
}

async function calcularRota() {
  const msgDiv = document.getElementById('mensagem');
  msgDiv.textContent = 'Calculando rota...';
  msgDiv.style.color = 'black';
  limparMapa();

  const enderecoA = document.getElementById('enderecoA').value.trim();
  const enderecoB = document.getElementById('enderecoB').value.trim();
  const extras = Array.from(document.querySelectorAll('.endereco-extra')).map(input => input.value.trim());
  const temRetorno = document.getElementById('temRetorno').checked;

  if (!enderecoA || !enderecoB) {
    msgDiv.textContent = 'Preencha pelo menos origem e destino.';
    msgDiv.style.color = 'red';
    return;
  }

  const enderecos = [enderecoA, enderecoB, ...extras.filter(e => e !== '')];
  let valorTotal = 0;
  let distanciaTotalKm = 0;

  try {
    // Buscar coordenadas do ponto A
    const pontoA = await buscarCoordenadas(enderecoA);
    L.marker([pontoA.lat, pontoA.lon]).addTo(map).bindPopup(enderecoA);

    // Para cada entrega, calcular a rota mínima A -> destino
    for (let i = 1; i < enderecos.length; i++) {
      const pontoDestino = await buscarCoordenadas(enderecos[i]);
      L.marker([pontoDestino.lat, pontoDestino.lon]).addTo(map).bindPopup(enderecos[i]);

      const rotaInfo = await desenharRota([pontoA, pontoDestino]);
      const distanciaKm = rotaInfo.distancia / 1000;

      distanciaTotalKm += distanciaKm;

      // Cálculo do valor para este ponto
      let valor = 8;
      if (distanciaKm > 3) {
        valor += (distanciaKm - 3) * 1.8;
      }
      if (temRetorno) {
        valor += distanciaKm * 0.8;
      }

      valorTotal += valor;
    }

    msgDiv.innerHTML = `
      Total de pontos: ${enderecos.length - 1}<br>
      Distância total (soma das menores rotas): ${distanciaTotalKm.toFixed(2)} km<br>
      <strong>Valor da entrega: R$ ${valorTotal.toFixed(2)}</strong>
    `;

  } catch (err) {
    msgDiv.textContent = err.message;
    msgDiv.style.color = 'red';
  }
}




function abrirWhatsApp() {
  if (!rotaInfoGlobal) {
    alert('Calcule a rota antes de enviar.');
    return;
  }

  const nomeCliente = document.getElementById('nomedocliente').value.trim();
  const solicitante = localStorage.getItem('usuario_nome') || 'Solicitante';
  const numPedido = document.getElementById('numPedido').value.trim();

  const enderecosResumo = rotaInfoGlobal.enderecosDigitados.map((end, i) => {
    const formatado = reinserirNumeroEndereco(end, rotaInfoGlobal.pontos[i].nomeFormatado);
    return `${String.fromCharCode(65 + i)}: ${resumirEndereco(formatado)}`;
  }).join('\n');

  const retornoTexto = rotaInfoGlobal.temRetorno ? 'Sim' : 'Não';

  const msg = `*Pedido de Entrega*\n
Nome do Cliente: ${nomeCliente}
Pedido Nº: ${numPedido}
${enderecosResumo}
Distância total: ${(rotaInfoGlobal.distancia / 1000).toFixed(2)} km
Tempo estimado: ${Math.round(rotaInfoGlobal.duracao / 60)} minutos
Retorno: ${retornoTexto}
Valor da entrega: R$ ${rotaInfoGlobal.valorEntrega.toFixed(2)}
Solicitante: ${solicitante}`;

  const numeroWhatsApp = '48988131927';
  const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

document.getElementById('btnCalcular').addEventListener('click', calcularRota);
document.getElementById('btnWhatsapp').addEventListener('click', abrirWhatsApp);

let contadorExtras = 0;

document.getElementById('btnAddEntrega').addEventListener('click', () => {
  contadorExtras++;
  const container = document.getElementById('enderecosExtras');

  const grupo = document.createElement('div');
  grupo.className = 'input-group mt-2';
  grupo.innerHTML = `
    <span class="input-group-text"><i class="bi bi-geo-alt-fill"></i></span>
    <input type="text" class="form-control endereco-extra" placeholder="Endereço Entrega Extra (Ponto ${String.fromCharCode(66 + contadorExtras)})" required />
  `;
  container.appendChild(grupo);
});
