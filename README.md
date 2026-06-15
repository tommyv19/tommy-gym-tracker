# 🏋️ GymTracker — Tommy

Progressive Web App per il tracciamento degli allenamenti, personalizzata per obiettivo **Men's Physique**. HTML/CSS/JavaScript vanilla, nessun framework, installabile su iPhone come app nativa.

## Funzionalità

- **Scheda** — 4 giorni (A/B/C/D), card esercizio collassabili con **foto reali animate** (start → contrazione in loop), log serie kg × rip, tasti *Copia ↑* e *Ripeti tutte*, completamento serie/esercizio, recap di fine allenamento (durata + volume).
- **🔄 Sostituzione esercizio** — su ogni esercizio puoi chiedere all'app un'alternativa equivalente che allena gli **stessi muscoli** con attrezzo o posizione diversa.
- **Calendario** — vista mensile con marker colorati per tipo giorno, dettaglio giornata, aggiunta manuale, statistiche (settimana/volume/streak).
- **Libreria** — 82 esercizi + stretching, filtri per gruppo muscolare / attrezzatura / difficoltà, ricerca, istruzioni e varianti.
- **Progressi & AI Coach** — misurazioni corporee con grafici, foto progressi (confronto), chat con **Claude AI**, analisi automatica ogni 6 settimane, richiesta cambio scheda (downgrade / upgrade / cambio / personalizza) con anteprima e approvazione.
- **Impostazioni** — profilo, configurazione Claude API ed EmailJS, esporta/importa backup JSON, reset.
- **Automazioni** — promemoria cambio scheda dopo 6 settimane, rilevamento stagnazione (stesso peso per 3+ sessioni), email via EmailJS, notifiche push.

## Immagini esercizi

Le foto reali (due frame: posizione iniziale e di contrazione) provengono dal dataset libero **free-exercise-db** servito via CDN jsDelivr. I due frame vengono alternati per simulare il movimento. Se un'immagine non è disponibile, l'app mostra automaticamente una figura SVG con i muscoli evidenziati (fallback).

## File

```
index.html      App principale
styles.css      Design system
data.js         Database esercizi + motore figure SVG
app.js          Logica applicazione
manifest.json   Manifest PWA
sw.js           Service worker
icons/          Icone 192/512
```

## 🚀 Pubblicare su GitHub Pages

1. Crea un account su [github.com](https://github.com) (se non ce l'hai).
2. Crea un **nuovo repository pubblico**, es. `tommy-gym-tracker`.
3. Carica **tutti i file di questa cartella** (`index.html`, `styles.css`, `data.js`, `app.js`, `manifest.json`, `sw.js` e la cartella `icons/`) nella **root** del repository.
   - Via web: *Add file → Upload files* → trascina i file → *Commit changes*. Carica anche la cartella `icons` trascinandola.
   - Via Git da terminale:
     ```bash
     git init
     git add .
     git commit -m "GymTracker PWA"
     git branch -M main
     git remote add origin https://github.com/TUO_USERNAME/tommy-gym-tracker.git
     git push -u origin main
     ```
4. Vai su **Settings → Pages**.
5. In *Source* scegli **Deploy from a branch**, branch **main**, cartella **/ (root)**, poi **Save**.
6. Dopo ~1 minuto l'app sarà online su:
   `https://TUO_USERNAME.github.io/tommy-gym-tracker/`

### Installazione su iPhone
Apri l'URL con **Safari** → tasto Condividi → **Aggiungi a schermata Home**. L'app si aprirà a tutto schermo come un'app nativa.

## ⚙️ Configurazione (Impostazioni nell'app)

- **Claude AI** — incolla la tua API key (`sk-ant-...`). La chiave resta solo sul tuo dispositivo (localStorage) e viene usata per chiamate dirette all'API Anthropic. Modello predefinito: `claude-sonnet-4-6`.
- **EmailJS** — crea un account gratuito su [emailjs.com](https://www.emailjs.com), poi inserisci *Service ID*, *Template ID* e *Public Key*. Variabili disponibili nel template: `to_email`, `user_name`, `date`, `reason`, `plan`, `message`.

## Note

- I dati (scheda, log, misurazioni, foto, impostazioni) sono salvati in **localStorage** sul dispositivo.
- L'app funziona online; la chat AI e le email richiedono connessione. Le foto degli esercizi vengono scaricate dal CDN al primo utilizzo.
- Backup consigliato periodicamente da *Impostazioni → Esporta*.
