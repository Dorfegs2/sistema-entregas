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

  const enderecos = [enderecoB, ...extras]; // Destinos (sem incluir A)
  const pontos = [];
  let pontoA;

  try {
    // Busca coordenadas do ponto A
    pontoA = await buscarCoordenadas(enderecoA);
    markerA = L.marker([pontoA.lat, pontoA.lon]).addTo(map).bindPopup('Origem (A)').openPopup();

    // Adiciona ponto A ao mapa
    let distanciaTotal = 0;
    let duracaoTotal = 0;
    let valorEntrega = 0;

    for (let i = 0; i < enderecos.length; i++) {
      const destino = await buscarCoordenadas(enderecos[i]);
      pontos.push(destino);

      L.marker([destino.lat, destino.lon]).addTo(map).bindPopup(`Entrega ${String.fromCharCode(66 + i)}: ${enderecos[i]}`);

      // Rota do A → destino
      const rota = await desenharRotaMultiplos([pontoA, destino]);

      const distanciaKm = rota.distancia / 1000;
      const duracaoMin = rota.duracao / 60;

      distanciaTotal += rota.distancia;
      duracaoTotal += rota.duracao;

      // Calcular valor individual da entrega
      let valor = 8.0;
      if (distanciaKm > 3) {
        valor += (distanciaKm - 3) * 1.8;
      }

      if (temRetorno) {
        valor += distanciaKm * 0.8;
      }

      // R$6 por parada extra (exceto primeira entrega)
      if (i > 0) {
        valor += 6;
      }

      valorEntrega += valor;
    }

    // Exibe resultados
    const totalKm = distanciaTotal / 1000;
    const totalMin = duracaoTotal / 60;

    msgDiv.innerHTML = `
      Total de entregas: ${enderecos.length}<br>
      Distância total: ${totalKm.toFixed(2)} km<br>
      Tempo estimado: ${totalMin.toFixed(0)} minutos<br>
      <strong>Valor total da entrega: R$ ${valorEntrega.toFixed(2)}</strong>
    `;

    rotaInfoGlobal = {
      pontos: [pontoA, ...pontos],
      distancia: distanciaTotal,
      duracao: duracaoTotal,
      valorEntrega,
      temRetorno,
      enderecosDigitados: [enderecoA, ...enderecos]
    };

    document.getElementById('btnWhatsapp').disabled = false;

  } catch (err) {
    msgDiv.textContent = err.message;
    msgDiv.style.color = 'red';
    document.getElementById('btnWhatsapp').disabled = true;
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
