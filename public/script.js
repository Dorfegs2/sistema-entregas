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

async function calcularRotaOtimizada() {
  const msgDiv = document.getElementById('mensagem');
  msgDiv.textContent = 'Calculando rota otimizada...';
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
    // Busca coordenadas de todos os endereços
    const enderecos = [enderecoA, enderecoB, ...extras];
    const coords = [];
    for (const e of enderecos) {
      const p = await buscarCoordenadas(e);
      coords.push(p);
    }

    const origem = coords[0];
    const paradas = coords.slice(1);

    // Função para gerar permutações das paradas
    function permutacoes(arr) {
      if (arr.length <= 1) return [arr];
      const resultado = [];
      arr.forEach((item, i) => {
        const resto = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const perm of permutacoes(resto)) {
          resultado.push([item, ...perm]);
        }
      });
      return resultado;
    }

    const ordens = permutacoes(paradas);

    let melhorOrdem = null;
    let menorDistancia = Infinity;
    let melhorRotaGeoJSON = null;

    // Testar todas as ordens para achar menor rota
    for (const ordem of ordens) {
      const rotaPontos = [origem, ...ordem];
      const coordsParaRota = rotaPontos.map(p => [p.lon, p.lat]);

      // Chamada POST para OpenRouteService
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          'Authorization': '5b3ce3597851110001cf6248fb2a1b09d2044e9c85c8e5d8750c7c76',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ coordinates: coordsParaRota })
      });

      if (!res.ok) {
        const erro = await res.text();
        throw new Error('Erro OpenRouteService: ' + erro);
      }

      const data = await res.json();

      const distancia = data.features[0].properties.summary.distance;
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        melhorOrdem = ordem;
        melhorRotaGeoJSON = data;
      }
    }

    // Mostrar marcadores no mapa: origem + ordem otimizada
    L.marker([origem.lat, origem.lon]).addTo(map).bindPopup('Origem (A)').openPopup();
    melhorOrdem.forEach((ponto, i) => {
      const letra = String.fromCharCode(66 + i);
      L.marker([ponto.lat, ponto.lon]).addTo(map).bindPopup(`Entrega ${letra}`);
    });

    // Desenhar a rota otimizada no mapa
    if (rotaLayer) map.removeLayer(rotaLayer);
    rotaLayer = L.geoJSON(melhorRotaGeoJSON, { style: { color: 'blue', weight: 5 } }).addTo(map);
    map.fitBounds(rotaLayer.getBounds());

    const duracao = melhorRotaGeoJSON.features[0].properties.summary.duration;
    const distanciaKm = menorDistancia / 1000;
    const duracaoMin = duracao / 60;

    // Calcular valor da entrega conforme regras
    let valorEntrega = 8.0;
    if (distanciaKm > 3) {
      valorEntrega += (distanciaKm - 3) * 1.8;
    }
    if (temRetorno) {
      valorEntrega += distanciaKm * 0.8;
    }
    // Paradas extras além da primeira entrega
    const pontosExtras = enderecos.length - 2;
    if (pontosExtras > 0) valorEntrega += pontosExtras * 6;

    msgDiv.innerHTML = `
      Total de pontos: ${enderecos.length}<br>
      Distância total: ${distanciaKm.toFixed(2)} km<br>
      Duração: ${duracaoMin.toFixed(0)} minutos<br>
      <strong>Valor da entrega: R$ ${valorEntrega.toFixed(2)}</strong>
    `;

    rotaInfoGlobal = {
      pontos: [origem, ...melhorOrdem],
      distancia: menorDistancia,
      duracao,
      valorEntrega,
      temRetorno,
      enderecosDigitados: enderecos
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
