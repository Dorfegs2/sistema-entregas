// Inicializa mapa Leaflet
const map = L.map('map').setView([-27.64966, -48.67656], 13);

const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let rotaLayer = null;
let markers = [];

// Função para limpar marcadores e rota antiga do mapa
function limparMapa() {
  if (rotaLayer) {
    map.removeLayer(rotaLayer);
    rotaLayer = null;
  }
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

// Função para buscar coordenadas usando Geocoding API do Google
async function buscarCoordenadas(endereco) {
  const apiKey = 'AIzaSyCjQUdB2AwYU5tV6LjFMJ0P8415O1_CJv8'; // substitua pela sua API Key
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Erro na Geocoding API: ' + await res.text());

  const data = await res.json();
  if (data.status !== 'OK') throw new Error('Geocoding API retornou erro: ' + data.status);

  const location = data.results[0].geometry.location;
  return { lat: location.lat, lon: location.lng };
}

// Função para chamar Google Directions API
async function calcularRotaGoogle(pontos) {
  if (pontos.length < 2) throw new Error('Necessário pelo menos origem e destino');

  const apiKey = 'AIzaSyCjQUdB2AwYU5tV6LjFMJ0P8415O1_CJv8';

  const origin = `${pontos[0].lat},${pontos[0].lon}`;
  const destination = `${pontos[pontos.length - 1].lat},${pontos[pontos.length - 1].lon}`;

  const waypoints = pontos.length > 2 ? pontos.slice(1, -1).map(p => `${p.lat},${p.lon}`).join('|') : '';

  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${apiKey}`;
  if (waypoints) {
    url += `&waypoints=optimize:true|${waypoints}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error('Erro Google Directions API: ' + await res.text());

  const data = await res.json();
  if (data.status !== 'OK') throw new Error('Google Directions API retornou erro: ' + data.status);

  return data;
}

// Função para desenhar rota no Leaflet usando polyline codificada do Google
function desenharRotaGoogle(data) {
  const route = data.routes[0];
  const polylineStr = route.overview_polyline.points;

  // Decodifica polyline para array de [lat, lon]
  const coords = polyline.decode(polylineStr).map(p => [p[0], p[1]]);

  if (rotaLayer) map.removeLayer(rotaLayer);
  rotaLayer = L.polyline(coords, { color: 'blue', weight: 5 }).addTo(map);
  map.fitBounds(rotaLayer.getBounds());
}

// Função para calcular valor da entrega
function calcularValorEntrega(distanciaKm, temRetorno, pontosExtras) {
  let valor = 8.0;
  if (distanciaKm > 3) {
    valor += (distanciaKm - 3) * 1.8;
  }
  if (temRetorno) {
    valor += distanciaKm * 0.8;
  }
  if (pontosExtras > 0) {
    valor += pontosExtras * 6;
  }
  return valor;
}

// Função principal para calcular a rota ao clicar no botão
async function calcularRota() {
  const msgDiv = document.getElementById('mensagem');
  msgDiv.textContent = 'Calculando rota...';
  msgDiv.style.color = 'black';
  limparMapa();

  const enderecoA = document.getElementById('enderecoA').value.trim();
  const enderecoB = document.getElementById('enderecoB').value.trim();
  const extras = Array.from(document.querySelectorAll('.endereco-extra')).map(i => i.value.trim()).filter(e => e !== '');
  const temRetorno = document.getElementById('temRetorno').checked;

  if (!enderecoA || !enderecoB) {
    msgDiv.textContent = 'Preencha pelo menos origem e destino.';
    msgDiv.style.color = 'red';
    return;
  }

  try {
    const enderecos = [enderecoA, enderecoB, ...extras];
    const pontos = [];

    // Buscar coordenadas e colocar marcadores no mapa
    for (const e of enderecos) {
      const p = await buscarCoordenadas(e);
      pontos.push(p);
      const marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(e);
      markers.push(marker);
    }

    const dadosRota = await calcularRotaGoogle(pontos);
    desenharRotaGoogle(dadosRota);

    // Somar distância e duração
    const resumo = dadosRota.routes[0].legs.reduce((acc, leg) => {
      acc.distancia += leg.distance.value;
      acc.duracao += leg.duration.value;
      return acc;
    }, { distancia: 0, duracao: 0 });

    const distanciaKm = resumo.distancia / 1000;
    const duracaoMin = resumo.duracao / 60;
    const pontosExtras = enderecos.length - 2;

    const valorEntrega = calcularValorEntrega(distanciaKm, temRetorno, pontosExtras);

    msgDiv.innerHTML = `
      Total de pontos: ${enderecos.length}<br>
      Distância total: ${distanciaKm.toFixed(2)} km<br>
      Duração: ${duracaoMin.toFixed(0)} minutos<br>
      <strong>Valor da entrega: R$ ${valorEntrega.toFixed(2)}</strong>
    `;

    // Habilitar botão WhatsApp (você pode ajustar o que fazer aqui)
    document.getElementById('btnWhatsapp').disabled = false;

  } catch (err) {
    msgDiv.textContent = err.message;
    msgDiv.style.color = 'red';
    document.getElementById('btnWhatsapp').disabled = true;
  }
}

// Evento botão adicionar parada extra
document.getElementById('btnAddEntrega').addEventListener('click', () => {
  const container = document.getElementById('enderecosExtras');
  const totalExtras = container.querySelectorAll('.endereco-extra').length;
  const letra = String.fromCharCode(67 + totalExtras); // 67 = 'C'

  const grupo = document.createElement('div');
  grupo.className = 'input-group mt-2';
  grupo.innerHTML = `
    <span class="input-group-text"><i class="bi bi-geo-alt-fill"></i></span>
    <input type="text" class="form-control endereco-extra" placeholder="Endereço Entrega Extra (Ponto ${letra})" required />
  `;
  container.appendChild(grupo);
});

// Evento botão calcular rota
document.getElementById('btnCalcular').addEventListener('click', calcularRota);
