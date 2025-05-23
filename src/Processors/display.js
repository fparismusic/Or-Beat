// ######################################## GESTIONE DELLA FORMA D'ONDA
const MIN_THRESHOLD = 0.1; // Threshold minima per gli onset (diff. tra gli starting points): 
// se ho due onset molto vicini il secondo lo ignoro!
const DOUBLE_CLICK_THRESHOLD = 250; // Tempo necessario per distinguere se l'utente fa 'click' o 'doppio-click'
let clickTimer = null;

const regions = WaveSurfer.Regions.create() // Creiamo una prima istanza del Plugin Region -> Questi sono i marker
const coloredRegions = WaveSurfer.Regions.create() // Creiamo una seconda istanza del Plugin Region -> Queste sono le regioni colorate
const timeline = WaveSurfer.Timeline.create({
  height: 20,
  timeInterval: 0.1,
  primaryLabelInterval: 0.5,
  style: {
    fontSize: '15px',
    color: '#B8860B',
  },
})
const regionStartTimes = {}; // Qui mi salverò tutti i starting points

const random = (min, max) => Math.random() * (max - min) + min
const randomColor = () => `rgba(139, 28, 29, 0.5)`;

//-------------------------------------------------------------------------------- GESTIONE FORMA D'ONDA CON WAVESURFER
// Creiamo la waveform
const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#748DA6',
  progressColor: '#EDD27C',
  cursorColor: '#ddd5e9',
  cursorWidth: 2,
  plugins: [regions, coloredRegions, timeline]
})

function displayWaveform(file) { // Viene chiamata dallo script.js  e disegna la waveform del file
  const fileURL = URL.createObjectURL(file);  // Crea un URL per il file (un oggetto URL.createObjectURL())

  // Carichiamo il file audio in WaveSurfer
  ws.load(fileURL);

  // Mostriamo la sezione contenente la checkbox e lo zoom
  ws.on('ready', function () {
    document.getElementById('workstation').style.display = 'block';
    document.querySelector('.savings').style.display = 'flex';
    document.getElementById('waveform-controls').style.display = 'block';

    p5on = true
    setup(p5on) // avvia setup (poi draw()) e quindi rende visibile tutto il codice p5

  });
}

//-------------------------------------------------------------------------------- GESTIONE LETTURA ONSETS
function onsetsRegions(onsetTimestamps, duration) { // Viene chiamata dallo script.js
  // duration: durata totale del brano

  if (!onsetTimestamps || onsetTimestamps.length === 0) {
    console.error("Nessun onset rilevato."); return;
  }

  // Puliamo e resettiamo...
  regions.clearRegions();

  // Creiamo la prima regione 'marker' dal punto 0 al primo onset, sulla forma d'onda
  ws.on('decode', () => {
    const firstRegion = regions.addRegion({
      id: '0',
      content: '',
      start: 0,                       // Tempo di inizio
      drag: false            // Permette di spostare la regione
    });
    regionStartTimes[firstRegion.id] = 0;
  });

  // Creiamo una regione 'marker' per ogni onset rilevato
  for (let i = 0; i < onsetTimestamps.length; i++) {
    const startTime = onsetTimestamps[i];

    if ((i + 1) < onsetTimestamps.length && (onsetTimestamps[i + 1] - startTime) >= MIN_THRESHOLD) {
      // Creiamo una regione sulla forma d'onda
      ws.on('decode', () => {
        const newRegion = regions.addRegion({
          id: i + 1,
          content: '',
          start: startTime,         // Tempo di inizio
          drag: true            // Permette di spostare la regione
        });
        regionStartTimes[newRegion.id] = startTime;
      });
    } else if ((i + 1) === onsetTimestamps.length && (duration - startTime) >= MIN_THRESHOLD) {
      // Gestiamo bene la fine/(l'ultimo marker avrà come punto di fine la durata totale del brano)
      ws.on('decode', () => {
        const newRegion = regions.addRegion({
          id: i + 1,
          content: '',
          start: startTime,         // Tempo di inizio
          drag: true            // Permette di spostare la regione
        });
        regionStartTimes[newRegion.id] = startTime;
      });
    }
  }
}

//-------------------------------------------------------------------------------- GESTIONE PAUSA AUDIO QUANDO ARRIVIAMO AL PROSSIMO MARKER
let activeRegion = null
ws.on('timeupdate', (currentTime) => {
  // When the end of the region is reached
  if (activeRegion && currentTime >= activeRegion.end) {
    // Stop playing
    ws.pause()
    activeRegion = null
  }
})

//-------------------------------------------------------------------------------- GESTIONE EVENTO CLICK -> riproduco audio
ws.on('click', () => {
  const clickTime = ws.getCurrentTime(); // Ottieni il tempo in cui è stato cliccato
  const regionsArray = regions.getRegions();
  let clickedRegion = null;

  // RILEVAZIONE DOPPIO-CLICK
  if (clickTimer !== null) {
    clearTimeout(clickTimer);  // Ferma il timer del clic singolo, questo significa che è un doppio clic
    clickTimer = null;  // Reset del timer
    //console.log("Doppio clic rilevato");
    // puliamo...
    coloredRegions.clearRegions();
    doubleclick();


    // RILEVAZIONE 'CLICK' SINGOLO
  } else {
    // Avviamo un timer per il clic singolo
    clickTimer = setTimeout(() => {
      //console.log("Clic singolo rilevato");
      // puliamo...
      coloredRegions.clearRegions();
      // Cerca la regione più vicina al clic
      for (let i = 0; i < regionsArray.length; i++) {
        if ((i + 1) < regionsArray.length) {
          const startTime = regionsArray[i].start;
          const nextStartTime = regionsArray[i + 1].start;

          // Se il tempo di clic è tra startTime e nextStartTime della regione
          if (clickTime >= startTime && clickTime <= nextStartTime) {
            clickedRegion = { id: regionsArray[i].id, start: startTime, end: nextStartTime };
            activeRegion = clickedRegion;
            break;
          }
        } else {
          // l'ultima regione dovrà suonare fino alla fine del brano
          ws.play(ws.getCurrentTime(), ws.getDuration());
        }
      }

      if (clickedRegion !== null) {
        ws.play();
      }
      clickTimer = null;  // Reset del timer dopo aver gestito il clic singolo
    }, DOUBLE_CLICK_THRESHOLD);
  }
});

//-------------------------------------------------------------------------------- GESTIONE OVERLAPPING MARKER
// Funzione per capire se tutti i marker sono in ordine oppure no, se restituisce False ho sovrapposizione di due marker
function checkStartTimesOrder() {
  // Ottieniamo tutte le regioni
  const regionsArray = regions.getRegions();

  // Estraiamo i startTimes delle regioni
  const startTimes = regionsArray.map(region => region.start);

  // Verifichiamo che gli startTimes siano in ordine crescente
  for (let i = 1; i < startTimes.length; i++) {
    if (startTimes[i] < startTimes[i - 1]) {
      console.warn("Gli startTimes non sono in ordine crescente! Reset ...");
      return false; // Restituisce false se gli startTimes non sono in ordine crescente
    }
  }

  // Se il ciclo finisce senza trovare errori, gli startTimes sono in ordine crescente
  //console.log("Gli startTimes sono in ordine crescente.");
  return true; // Restituisce true se gli startTimes sono corretti
}

// NO OVERLAPPING REGIONS
regions.on('region-updated', (region) => {
  try {
    let draggedRegion = null;
    const originalStartTime = regionStartTimes[region.id];
    const newStartTime = region.start;

    // puliamo...
    coloredRegions.clearRegions();
    // Ottieniamo tutte le regioni esistenti
    const regionsArray = regions.getRegions();

    // Controlliamo se c'è una sovrapposizione tra la regione corrente e un'altra
    if (!checkStartTimesOrder()) {
      alert("Non puoi spostare la regione su un altro marker!");

      // Ripristiniamo la posizione originale
      region.setOptions({ start: originalStartTime });
      return;
    }

    // Aggiorniamo i tempi solo se non ci sono sovrapposizioni
    draggedRegion = { id: region.id, start: newStartTime };
    regionStartTimes[region.id] = newStartTime;

    //aggiorniamo la posizione dell'onset anche nel modello
    modello.onsets[region.id - 1] = newStartTime;
  } catch (e) {
    console.log("Errore nel muovere la regione");
    alert("Errore nel muovere la regione");
  }
})

// ZOOM LEVEL
ws.once('decode', () => {
  document.getElementById('zoom').oninput = (e) => {
    const minPxPerSec = Number(e.target.value)
    ws.zoom(minPxPerSec)
  }
})

//-------------------------------------------------------------------------------- GESTIONE EVENTO DOPPIO-CLICK
function doubleclick() {
  const clickTime = ws.getCurrentTime(); // Ottieniamo il tempo in cui è stato cliccato
  const regionsArray = regions.getRegions();
  var data = null;
  let newRegion = null;
  let startTime = null;
  let nextStartTime = null;

  // Cerchiamo la regione più vicina al clic
  for (let i = 0; i < regionsArray.length; i++) {
    startTime = regionsArray[i].start;

    if ((i + 1) < regionsArray.length) {

      nextStartTime = regionsArray[i + 1].start;
      // Se il tempo di clic è tra startTime e nextStartTime della regione
      if (clickTime >= startTime && clickTime <= nextStartTime) {
        newRegion = coloredRegions.addRegion({
          start: startTime,                       // Tempo di inizio
          end: nextStartTime,     // Tempo di fine
          color: randomColor(),  // Colore della regione
          drag: false,            // Permette di spostare la regione
          resize: false,       // Permette di ridimensionare la regione
        });

        data = { startTime: startTime, nextStartTime: nextStartTime };
        break;
      }
    } else {
      // fine della lista delle regioni
      nextStartTime = ws.getDuration();

      newRegion = coloredRegions.addRegion({
        start: startTime,                       // Tempo di inizio
        end: ws.getDuration(),     // Tempo di fine
        color: randomColor(),  // Colore della regione
        drag: false,            // Permette di spostare la regione
        resize: false,       // Permette di ridimensionare la regione
      });

      data = { startTime: startTime, nextStartTime: ws.getDuration() };
      break;
    }
  }

  // LOGICA DI ESPORTAZIONE
  const event = new CustomEvent('waveDataReady');
  // Memorizziamo i dati in una variabile globale (window)
  window.waveData = data;
  window.dispatchEvent(event);
}
// _________________________________________________________________________________
// ######################################## GESTIONE DELLA DRUM MACHINE IN p5
p5on = false // se imposta su false setup non runna, quindi tutto il codice p5 non sarà runnato.

// Variabili per gli anelli
let anelli = []; // Array per memorizzare gli anelli creati
let maxAnelli = 6; // Numero massimo di anelli consentiti
let diametroBase = 150; // Diametro base del primo anello
let spessoreAnello = 9; // Spessore degli anelli
let bottoneCreaAnello;
let bottoneRimuoviAnello;
let gap = 12 // spazio tra le sezioni dell'anello
let rotationOffset = -90 // perché l'angolo definito da p5 inizia "alle ore 3"

// Variabili per la barra che ruota
let angle = rotationOffset; // Angolo iniziale
let rotationSpeed; // Velocità di rotazione
let isRunning = false; // Stato della rotazione della barra
let bpm = 80;
let truebpm=80;
let bpmChanged = false;
let x = 0

function setup(p5on) {
  createCanvas(0, 0); // scrivo questo altrimenti di default si vede il canvas di p5 nella pagina iniziale

  if (!p5on) { return }

  const canvas = createCanvas(450, 450);
  canvas.parent('canvas-container'); // Collegalo al contenitore della forma d'onda

  angleMode(DEGREES);


  // Creo i buttoni per controllare la barra
  createControls();
}

function draw() {
  background('#DDDDDD');



  // Calcola i BPM conoscendo rotation speed
  // let timeForOneRotation = 360 / (rotationSpeed * frameRate());
  // bpm = (60 * 4) / timeForOneRotation;
  // console.log(`BPM: ${bpm.toFixed(2)}`); // Print dei BPM nella console

  // Calcola rotation speed conoscendo i bpm
  rotationSpeed = (truebpm * 360) / (240 * frameRate());

  translate(width / 2, height / 2);


  // Disegna tutti gli anelli
  for (let anello of anelli) {
    anello.disegna();
  }

  // Disegna la barra quando disegno il primo anello
  if (anelli.length > 0) {
    push();
    rotate(angle); // Ruota secondo l'angolo
    stroke(30); // Colore della barra
    strokeWeight(5); // Spessore della barra
    let lunghezzabarra = anelli[anelli.length - 1].diametro / 2 + 10 // è in funzione di quanti anelli ci sono
    line(0, 0, lunghezzabarra, 0); // Disegna la barra
    pop();

    // Aggiorna l'angolo per creare il movimento se la rotazione è attiva
    if (isRunning) {
      angle += rotationSpeed; // Velocità della rotazione
      if (angle >= 270) {
        angle = rotationOffset; // Resetta l'angolo dopo un giro completo 360 - 90
      }
    }
  }
}

function rimuoviUltimoAnello() {
  anelli.pop();
  modello.removeRing(anelli.length - 1);
}

function rimuoviAnello(i) {
  console.log("Rimuovo anello con indice:", i);

  // Stoppa e distrugge il player se esiste
  if (anelli[i].player) {
      anelli[i].player.stop();
      anelli[i].player.dispose();  // Libera la memoria
      anelli[i].player = null;  // Rimuove il riferimento
  }

  // Stoppa e distrugge la sequence
  if (anelli[i].sequence) {
      anelli[i].sequence.stop();
      anelli[i].sequence.dispose();
      anelli[i].sequence = null;
  }

  // Rimuoviamo l'anello dall'array
  anelli.splice(i, 1);

  // Rimuoviamo l'anello dalla matrice di rappresentazione
  modello.removeRing(i);

  console.log("Stato degli anelli dopo la rimozione:", anelli);
  console.log("Stato della matrice di rappresentazione:", modello.representation_matrix);
}

function comprimiAnelli(index) {
  //quì mi salvo i diametri
  let diametri = anelli.map(anello => anello.diametro);
  console.log('Diametri prima della compressione:', diametri);

  for (let i = index + 1; i < anelli.length; i++) {
    console.log(`Aggiornando diametro di anello ${i}, da ${anelli[i].diametro} a ${diametri[i - 1]}`);
    anelli[i].diametro = diametri[i - 1];
  }
  console.log('Anelli dopo compressione:', anelli);
}

function creaAnello(steps, colorInput) {
  if (anelli.length >= maxAnelli) {
    console.log("Limite anelli raggiunto");
    return;
  }
  let nuovoAnello = new Anello(steps, colorInput, diametroBase + anelli.length * spessoreAnello * 5);
  anelli.push(nuovoAnello);

  modello.addRing([], steps, 0, 0, colorInput); //todo linkare alla matrice
}


let globalDuration = (60 / truebpm) * 4; // Durata di un beat completo della barra in secondi
class Anello {
  constructor(steps, color, diametro) {
    this.steps = steps;
    this.color = color;
    this.diametro = diametro;
    this.bool_list = Array(steps).fill(false); // Inizialmente tutte le sezioni sono disattivate
    this.lastHighlightedIndex = null; // Indice dell'ultima sezione evidenziata, 
    // serve per suoanre il sample solo nel momento in cui la barra incontra la parte di anello attiva
    this.player = null; // Player per il suono
    this.sequence = null;
    this.hasToUpdate = false;
    this._updatingSequence = false;
  }


  calculateNoteDivision(boolList) {
    const x = globalDuration / boolList.length;
    console.log("globalDuration:" + globalDuration)
    return x.toString() + 's';
    
    /* const durationbeat = globalDuration/boolList.length;
    return (totalDuration/boolList.length).toString() + 'n'; */
  }


  createSequence(player, totalDuration) {
    this.player = player;
    const noteDivision = this.calculateNoteDivision(this.bool_list);

    this.sequence = new Tone.Sequence((time, value) => {
      if (value && this.player) {
        console.log("SUONO");
        if (this.player.state === "started") this.player.stop();
        this.player.start(time); // Suona solo per i valori true
      }
    }, this.bool_list, noteDivision);
    this.sequence.loop = true;
  }

  updateSequenceWithBoolList() {
    
    if (this._updatingSequence) return;
  this._updatingSequence = true;
  
  // Dopo 50 ms, resetta il flag (puoi regolare questo valore)
  setTimeout(() => {
    this._updatingSequence = false;
  }, 50);

      console.log("bool list della sequenza cambia oppure il bpm cambia");
      
      if (this.sequence) {
        if (this.player) {
          this.player.stop();
          this.sequence.stop(0.0001); // Ferma la sequenza corrente
          this.sequence.dispose(); // Libera risorse dalla sequenza precedente
        }
      }
      // Aggiorniamo la sequenza con la nuova lista

      // Aggiorniamo la lista dell'anello
      const noteDivision = this.calculateNoteDivision(this.bool_list);
      console.log("Note division:" + noteDivision)
      

      // Ricreaiamo la sequence
      let lastTime = 0; // Memorizziamo il tempo dell'ultimo step
      this.sequence = new Tone.Sequence((time, value) => {
        if (this.player && value) {
          if (this.player.state === "started") this.player.stop();
          this.player.start(time); // Suona solo se il valore è true

          // Printiamo il time in cui la sequence suona il player e lo compara con quello precedente
          console.log("time in cui viene suonato il player della sequence dell'annello #"+ anelli.indexOf(this)+":" + time)
          const diff = time - lastTime;
          console.log("Differenza con il tempo precedente:"+diff)
          lastTime=time
        }
      }, this.bool_list, noteDivision);
      //const offset = (angle - rotationOffset) / 360 * (globalDuration / this.steps);
      this.sequence.loop = true;
      this.sequence.start(0.002);
    
  }

  disegna() {
    strokeWeight(spessoreAnello);
    noFill()

    let gap2 = gap - anelli.indexOf(this) * 1.4; // gap che decrementa più l'anello è grande, in modo da avere lo stesso gap per ogni anello
    let angoloStep = 360 / this.steps - gap2;

    for (let i = 0; i < this.steps; i++) {
      let startAngolo = i * (angoloStep + gap2) + rotationOffset;
      let endAngolo = startAngolo + angoloStep;

      // Controlliamo se la barra si trova sopra questo segmento
      let highlight = angle >= startAngolo && angle < endAngolo;


      if(highlight && isRunning && angle === rotationOffset){
        truebpm = bpm;
      }
      //QUANDO PASSA DALL'INIZIO, CHIAMA TONE.TRANSPORT.pause() 
      if (highlight && isRunning && angle === rotationOffset && (this.hasToUpdate || bpmChanged)) {
        Tone.Transport.pause();
        Tone.Transport.position = "0:0:0";
        Tone.Transport.bpm.value = bpm;
        this.updateSequenceWithBoolList();
        Tone.Transport.start();
        this.hasToUpdate = false;
        bpmChanged = false;
        if (!this._updatingSequence) {
          this._updatingSequence = true;
          Tone.Transport.pause();
          Tone.Transport.position = "0:0:0";
          Tone.Transport.bpm.value = bpm; // Aggiorniamo il BPM globale

          this.updateSequenceWithBoolList();

          Tone.Transport.start();
          this.hasToUpdate = false;
          bpmChanged = false;
          // Resettiamo il flag dopo un breve intervallo (ad esempio 50 ms)
          setTimeout(() => {
            this._updatingSequence = false;
          }, 50);
        }
      }
      

      // Impostiamo il colore del segmento
      if (highlight & isRunning) {
        stroke(this.bool_list[i] ? this.color : 180); // Colore evidenziato
        strokeWeight(spessoreAnello + 4)

        // Se il segmento è attivo, chiama la funzione per suonare il sample
        if (this.bool_list[i] && this.lastHighlightedIndex !== i) {
          // Chiamata alla funzione

          this.lastHighlightedIndex = i; // Aggiorna l'indice dell'ultima sezione evidenziata
        }
      } else {
        stroke(this.bool_list[i] ? this.color : 180); // colore che ho scelto per l'anello
        strokeWeight(spessoreAnello)
      }

      // Disegna la parte dell'anello
      arc(0, 0, this.diametro, this.diametro, startAngolo, endAngolo);

      // Resetta l'indice quando la barra non evidenzia più alcun segmento attivo
      if (!isRunning || !this.bool_list.some((isActive, index) => {
        let startAngolo = index * (angoloStep + gap) + rotationOffset;
        let endAngolo = startAngolo + angoloStep;
        return angle >= startAngolo && angle < endAngolo && isActive;
      })) {
        this.lastHighlightedIndex = null;
      }
    }
  }

  toggleStep(indice) {
    if (indice >= 0 && indice < this.steps) {
      this.bool_list[indice] = !this.bool_list[indice];
      this.hasToUpdate = true;
    }
  }
}

function mousePressed() {
  let x = mouseX - width / 2;
  let y = mouseY - height / 2;
  let distanza = dist(0, 0, x, y);

  let i_ring;
  for (let anello of anelli) {
    let raggioInterno = anello.diametro / 2 - 10;
    let raggioEsterno = anello.diametro / 2 + spessoreAnello;

    if (distanza > raggioInterno && distanza < raggioEsterno) {
      let angolo = atan2(y, x) - rotationOffset;
      if (angolo < 0) angolo += 360;

      let indice = floor(angolo / (360 / anello.steps));
      anello.toggleStep(indice);
      i_ring = anelli.indexOf(anello);
      modello.modifyRingBooleanList(i_ring, anello.bool_list);
      break;
    }
  }
}
let playPauseButton;
function createControls() {
  const baseX = 1130;
  const baseY = height - 120;

  // CREAZIONE DEL PULSANTE TENDINA HIDE/SHOW
  playPauseButton = createDiv('<button id="toggle-savings">Hide  <i class="fa-solid fa-arrow-up-short-wide"></i></button>');
  // Assicuriamo che il div .savings sia visibile all'inizio
  document.querySelector('.savings').classList.add('open'); // Questa riga rende .savings visibile

  // Aggiungiamo l'evento di click sul bottone
  document.getElementById('toggle-savings').addEventListener('click', function () {
    const canvasContainer = document.getElementById('canvas-container');
    const savings = document.querySelector('.savings');
    const button = document.getElementById('toggle-savings');
    const icon = button.querySelector('i'); // Ottieni l'icona dentro il pulsante

    // Toggle per nascondere/mostrare
    savings.classList.toggle('open');
    canvasContainer.classList.toggle('move-up'); // Sposta il canvas container

    // Aggiorniamo il testo e l'icona del pulsante
    if (savings.classList.contains('open')) {
      icon.classList.remove('fa-arrow-down-short-wide');
      icon.classList.add('fa-arrow-up-short-wide');
      button.textContent = ''; // Resettiamo il contenuto del pulsante
      button.append('Hide  '); // Aggiungiamo "Hide"
      button.append(icon); // Riaggiungiamo l'icona
    } else {
      icon.classList.remove('fa-arrow-up-short-wide');
      icon.classList.add('fa-arrow-down-short-wide');
      button.textContent = ''; // Resettiamo il contenuto del pulsante
      button.append('Show  '); // Aggiungiamo "Show"
      button.append(icon); // Riaggiungiamo l'icona
    }
  });



  // Creiamo un unico pulsante Play/Pause
  playPauseButton = createDiv('<i class="fas fa-play-circle"></i>');
  playPauseButton.id('playPauseOrbit-btn');
  playPauseButton.mousePressed(toggleRotation);

  let stopButton = createDiv('<i class="fas fa-stop-circle"></i>'); // Simbolo "Stop"
  stopButton.id('resetOrbit-btn');
  stopButton.mousePressed(stopRotation);

  // Creiamo l'elemento testo per visualizzare il valore del BPM
  let bpmText = createDiv(`${bpm} BPM`);
  bpmText.id('bpm-value'); // Aggiungi l'ID per personalizzare tramite CSS

  // Creiamo la barra di controllo dei bpm
  let bpmSlider = createSlider(40, 180, 80, 1);
  bpmSlider.id('sliderOrbit-btn');
  bpmSlider.input(() => {
    bpm = bpmSlider.value();
  globalDuration = (60 / bpm) * 4;
  bpmChanged = true;
  bpmText.html(`${bpm} BPM`); // Aggiorna il testo del BPM
  });

  /* let customRectangle = createDiv("Info Box");
  customRectangle.id('custom-rectangle');

  // Posizioniamo il div tra il BPM slider e il bottone di registrazione
  document.getElementById("recordings2").appendChild(customRectangle); */
}

let resettaTransport = false
// Funzione che alterna Play/Pause
function toggleRotation() {
  isRunning = !isRunning; // Cambia stato
  if (isRunning) {
    // Se ho avviato la drum machine, fai:
    playPauseButton.html('<i class="fas fa-pause-circle"></i>'); // Cambia icona a "Pause"
    playPauseButton.removeClass('play-hover'); // Rimuove il colore hover verde
    playPauseButton.addClass('pause-hover');  // Aggiunge il colore hover rosso

    Tone.Transport.bpm.value = truebpm; // Imposta il BPM globale di Tone

    Tone.Transport.start();

    
      
    console.log("tone transport started");
    console.log("Rotazione avviata");
  } else {
    // Se ho messo in pausa la drum machine, fai:
    playPauseButton.html('<i class="fas fa-play-circle"></i>'); // Cambia icona a "Play"
    playPauseButton.removeClass('pause-hover'); // Rimuove il colore hover rosso
    playPauseButton.addClass('play-hover');
    Tone.Transport.pause();
    console.log("Rotazione in pausa");
  }
}


// Funzione per fermare e resettare la rotazione
async function stopRotation() {
  if (isRunning) {
    playPauseButton.html('<i class="fas fa-play-circle"></i>'); // Cambia icona a "Play"
    playPauseButton.removeClass('pause-hover'); // Rimuove il colore hover rosso
    playPauseButton.addClass('play-hover');  // Aggiunge il colore hover verde
    
    console.log("Rotazione in pausa");    
  }
  Tone.Transport.pause();
  Tone.Transport.position = "0:0:0";
  anelli.forEach(anello=>{
    if(anello.sequence){
      anello.sequence.stop(0.001);
      anello.sequence.start(0.0011);
    }
  });
  isRunning = false;
  angle = rotationOffset; // Resetta l'angolo
 
}
