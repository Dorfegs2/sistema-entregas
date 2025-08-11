let rotaLayer = null;

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

// Função para desenhar rota no Leaflet usando a polyline codificada do Google
function desenharRotaGoogle(data) {
  const route = data.routes[0];
  const polylineStr = route.overview_polyline.points;

  // Decodifica a polyline para array de [lat, lon]
  const coords = polyline.decode(polylineStr).map(p => [p[0], p[1]]);

  if (rotaLayer) map.removeLayer(rotaLayer);
  rotaLayer = L.polyline(coords, { color: 'blue', weight: 5 }).addTo(map);
  map.fitBounds(rotaLayer.getBounds());
}


// Função principal adaptada para usar Google Directions
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
    for (const e of enderecos) {
      const p = await buscarCoordenadas(e);
      pontos.push(p);
      L.marker([p.lat, p.lon]).addTo(map).bindPopup(e);
    }

    const dadosRota = await calcularRotaGoogle(pontos);
    desenharRotaGoogle(dadosRota);

    // Calcular distância e duração somando todas as legs
    const resumo = dadosRota.routes[0].legs.reduce((acc, leg) => {
      acc.distancia += leg.distance.value;
      acc.duracao += leg.duration.value;
      return acc;
    }, { distancia: 0, duracao: 0 });

    const distanciaKm = resumo.distancia / 1000;
    const duracaoMin = resumo.duracao / 60;

    // Cálculo do valor da entrega
    let valorEntrega = 8.0;
    if (distanciaKm > 3) {
      valorEntrega += (distanciaKm - 3) * 1.8;
    }
    if (temRetorno) {
      valorEntrega += distanciaKm * 0.8;
    }
    const pontosExtras = enderecos.length - 2;
    if (pontosExtras > 0) valorEntrega += pontosExtras * 6;

    msgDiv.innerHTML = `
      Total de pontos: ${enderecos.length}<br>
      Distância total: ${distanciaKm.toFixed(2)} km<br>
      Duração: ${duracaoMin.toFixed(0)} minutos<br>
      <strong>Valor da entrega: R$ ${valorEntrega.toFixed(2)}</strong>
    `;

    rotaInfoGlobal = {
      pontos,
      distancia: resumo.distancia,
      duracao: resumo.duracao,
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
