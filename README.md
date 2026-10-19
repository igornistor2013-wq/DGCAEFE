# Direcția Generală Asistență Externă și Fonduri Europene

Pagina direcției din cadrul Cancelariei de Stat a Republicii Moldova, cu **panou de administrare**: după autentificare se pot adăuga și modifica texte, documente, fotografii, știri, evenimente și acte normative, fără cunoștințe de programare.

Conținutul de pornire provine din paginile oficiale [gov.md](https://gov.md) (cadrul legal, cooperarea externă, programele de cooperare transfrontalieră, transnațională și interregională, evenimente).

## Cuprins

1. [Ce conține](#1-ce-conține)
2. [Pornire rapidă pe calculator](#2-pornire-rapidă-pe-calculator)
3. [Autentificarea ca administrator](#3-autentificarea-ca-administrator)
4. [Ce se poate administra](#4-ce-se-poate-administra)
5. [Publicarea pe GitHub — citiți înainte de a începe](#5-publicarea-pe-github--citiți-înainte-de-a-începe)
6. [Variabile de configurare](#6-variabile-de-configurare)
7. [Datele, copiile de siguranță și restaurarea](#7-datele-copiile-de-siguranță-și-restaurarea)
8. [Securitate](#8-securitate)
9. [Structura proiectului](#9-structura-proiectului)
10. [Teste](#10-teste)
11. [Limite cunoscute](#11-limite-cunoscute)
12. [Surse și licențe](#12-surse-și-licențe)

---

## 1. Ce conține

**Pagina publică** (`/`): stil instituțional, cu sigla Guvernului, bară de accesibilitate (mărire text, contrast ridicat) și secțiunile Noutăți, Despre direcție, Cadrul legal, Cooperare externă, Programe, Documente (cu filtre și căutare), Evenimente, **Galerie foto** (cu vizualizare mărită) și Contacte, plus căutare în tot conținutul (`Ctrl + K`).

**Panoul de administrare** (`/admin/`): autentificare cu utilizator și parolă, apoi:

- gestionarea știrilor, documentelor (cu încărcare de fișiere), fotografiilor, evenimentelor, actelor normative și programelor;
- editarea textelor paginii (titlu, prezentare, contacte, subsol);
- schimbarea parolei, jurnal de activitate, copie de siguranță și export pentru GitHub Pages.

**Versiunea statică** (doar citire): aceeași pagină publică, fără server, pentru GitHub Pages sau orice găzduire de fișiere (`npm run build:static`).

Tehnologie: Node.js și Express; datele se păstrează în fișiere JSON, fără bază de date. Singurul serviciu extern este harta Google din secțiunea Contacte; fonturile și sigla sunt incluse în proiect.

---

## 2. Pornire rapidă pe calculator

Aveți nevoie de [Node.js](https://nodejs.org) 22 LTS (minimum 20.12).

```bash
npm install
npm start
```

- Pagina publică: <http://localhost:3000>
- Administrare: <http://localhost:3000/admin/>

La prima pornire, aplicația creează în folderul `storage/` tot ce îi trebuie: conținutul de pornire, folderele pentru fișiere și contul de administrator (vezi mai jos).

Pentru lucru cu reîncărcare automată după modificarea codului: `npm run dev`.

Pentru a limita accesul la calculatorul dumneavoastră (nu la rețeaua locală), setați `HOST=127.0.0.1`.

---

## 3. Autentificarea ca administrator

La prima pornire se creează contul **`admin`**.

- Dacă ați setat variabila `ADMIN_PASSWORD` (minimum 10 caractere), aceasta este parola.
- Dacă nu, aplicația generează o parolă aleatorie și o **afișează o singură dată în consolă** (sau în jurnalul serviciului de găzduire), într-un chenar:

  ```
  ==============================================================
   Cont de administrator creat
     Utilizator: admin
     Parola:     ...
  ==============================================================
  ```

Intrați la `/admin/` și **schimbați parola** din secțiunea „Cont și parolă”.

**Ați uitat parola?** Opriți aplicația și rulați, pe calculatorul sau serverul unde se află datele:

```bash
npm run admin:password                 # resetează parola contului „admin”
npm run admin:password -- maria.popescu # creează sau resetează alt cont
```

Scriptul cere parola în consolă (sau o citește din variabila `ADMIN_NEW_PASSWORD`). Pe un server Docker rulați-l în container: `docker compose exec site node scripts/set-password.js`.

Toți administratorii au aceleași drepturi. Un cont nou se creează cu comanda de mai sus.

---

## 4. Ce se poate administra

| Secțiune din panou | Ce permite |
|---|---|
| **Știri** | Titlu, dată, text cu formatare simplă (paragrafe, liste, titluri, text aldin, legături), imagine, publicare sau ciornă |
| **Documente** | Rapoarte, acorduri, documente pe programe, buletine informative: fișier încărcat (PDF, Word, Excel, PowerPoint, OpenDocument, RTF, TXT, CSV, ZIP) sau legătură externă |
| **Galerie foto** | Încărcare a mai multor fotografii deodată (JPG, PNG, WebP, GIF), albume, titlu și descriere pentru cititoare de ecran, mutare între albume, ștergere în grup |
| **Evenimente** | Dată, loc, descriere, legături |
| **Cadrul legal** | Legi, hotărâri de Guvern, ordine |
| **Programe** | Descrierea programelor de cooperare |
| **Texte pagină** | Titlul și prezentarea de pe prima pagină, datele de contact, harta, subsolul |
| **Publicare și copii** | Export pentru GitHub Pages și copie de siguranță |
| **Jurnal de activitate** | Cine și când a modificat ce |
| **Cont și parolă** | Schimbarea parolei |

Fotografiile sunt pregătite automat în browser, înainte de încărcare: se redimensionează (maximum 2000 px), se convertesc în JPEG (cu excepția GIF-urilor animate), se creează o miniatură și se elimină datele EXIF, inclusiv locația GPS. Prima dată, galeria conține șase **imagini de exemplu** (marcate „Imagine de exemplu”), pe care le puteți șterge dintr-un clic din panou, după ce încărcați fotografii reale.

Când un administrator este autentificat și deschide pagina publică, apare o bară cu legături rapide și, lângă fiecare element, legătura „Editează”.

---

## 5. Publicarea pe GitHub — citiți înainte de a începe

### 5.1 Ce poate și ce nu poate GitHub

GitHub păstrează codul și îl poate publica gratuit ca **site static** (GitHub Pages). Un site static nu poate verifica parole și nu poate primi fișiere încărcate, deci **panoul de administrare nu poate rula pe GitHub Pages**. Administrarea are nevoie de un server Node.js cu un disc care păstrează datele.

Aveți trei variante:

| Varianta | Administrare online | Cost | Potrivită când |
|---|---|---|---|
| **A. GitHub Pages** (publicare automată) | Nu. Se administrează local, apoi se trimite pe GitHub | Gratuit | Conținutul se schimbă rar, de către o singură persoană |
| **B. Server Node cu disc persistent** (Render, Docker pe un server) | Da, la adresa `/admin/` | De regulă plătit (disc persistent) | Mai mulți editori, modificări frecvente |
| **C. Ambele** | Da, pe server; pagina publică și pe Pages | — | Se dorește și o copie statică |

### 5.2 Încărcarea proiectului pe GitHub

1. Creați un depozit nou pe GitHub (fără fișier README inițial).
2. În folderul proiectului (dezarhivat), rulați:

   ```bash
   git init
   git add .
   git commit -m "Prima versiune"
   git branch -M main
   git remote add origin https://github.com/NUME-UTILIZATOR/NUME-DEPOZIT.git
   git push -u origin main
   ```

   Fișierul `.gitignore` exclude automat `node_modules`, fișierul `.env` și `storage/private/` (parole criptate, cheia sesiunilor, jurnalul). **Nu încărcați niciodată** folderul `storage/private/` sau un fișier `.env`.

   Dacă preferați interfața grafică, folosiți [GitHub Desktop](https://desktop.github.com). Încărcarea prin site-ul GitHub („Add file → Upload files”) este posibilă, dar Git sau GitHub Desktop păstrează sigur folderele ascunse (`.github`) și sunt mai potrivite pentru actualizări.

Cele două fluxuri de lucru din `.github/workflows/` pornesc singure:

- **Teste** (`ci.yml`): rulează testele automate la fiecare trimitere de modificări.
- **Publică pe GitHub Pages** (`pages.yml`): construiește și publică versiunea statică (vezi mai jos).

### 5.3 Varianta A — GitHub Pages

1. În depozitul GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (o singură dată).
2. La următorul `push` pe ramura `main`, fluxul „Publică pe GitHub Pages” construiește pagina și o publică. Adresa apare în **Settings → Pages**, de regulă `https://NUME-UTILIZATOR.github.io/NUME-DEPOZIT/`. Prima publicare durează câteva minute.

Fluxul publică conținutul din folderul `storage/` dacă acesta există în depozit, altfel conținutul de pornire din `seed/`.

**Cum se actualizează pagina:**

```bash
npm start                                  # lucrați în http://localhost:3000/admin/
# opriți serverul (Ctrl + C), apoi:
git add storage/content storage/uploads
git commit -m "Actualizare conținut"
git push
```

Pagina publică se actualizează singură în 1–2 minute. (Nu adăugați `storage/private/`; este exclus automat.)

**Variantă fără GitHub Actions:** în panou, secțiunea „Publicare și copii” → „Descarcă exportul static (ZIP)”. Dezarhivați și încărcați conținutul în rădăcina unui depozit separat, apoi **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**. Același export se poate face din linia de comandă: `npm run build:static` (rezultatul apare în `dist/`; opțiuni: `--data <folder>` și `--out <folder>`).

**De știut:**

- Versiunea statică funcționează și într-un subfolder (`utilizator.github.io/depozit/`) și se poate deschide direct din fișier (`index.html`), fără server.
- Pagina publicată include **doar** elementele publicate; ciornele nu apar. Dar fișierul `storage/content/news.json` le conține, deci într-un **depozit public** ciornele pot fi citite în depozit. Păstrați ciornele doar pe server sau nu încărcați `storage/` într-un depozit public.
- Site-urile GitHub Pages sunt publice. Pentru depozite private, GitHub Pages cere un plan plătit GitHub.
- Căutarea, galeria, filtrele și formularul de contact funcționează și în versiunea statică. Fișierele încărcate din panou ajung în `uploads/`.

### 5.4 Varianta B — server cu administrare online

Aplicația trebuie să ruleze pe un server Node.js (sau în Docker) cu **un disc persistent** montat la folderul de date (`DATA_DIR`). Fără disc persistent, tot ce se introduce din panou se pierde la reînnoirea serviciului. Pagina trebuie servită de la **rădăcina unui domeniu sau subdomeniu** (de ex. `https://exemplu.md/`), nu dintr-un subfolder.

**Render** (cel mai simplu, direct din depozitul GitHub):

1. Pe [render.com](https://render.com): **New → Blueprint**, alegeți depozitul. Fișierul `render.yaml` configurează serviciul, discul de 1 GB la `/var/data` și variabilele.
2. Când vi se cere, introduceți `ADMIN_PASSWORD` (minimum 10 caractere).
3. După publicare, intrați la `https://NUME-SERVICIU.onrender.com/admin/`.

Discurile persistente sunt disponibile doar pentru servicii cu plan plătit, iar un serviciu cu disc nu poate rula pe mai multe instanțe. Verificați planul și prețul curent pe Render înainte de a confirma. Pe un plan fără disc, administrarea ar funcționa, dar modificările s-ar pierde. Serviciul se poate crea și manual (Web Service, `npm ci` / `npm start`, variabilele din secțiunea 6, un Disk montat la `/var/data`). Alte platforme cu volume persistente (Railway, Fly.io) funcționează după același model.

**Docker** (pe orice server):

```bash
cp .env.example .env          # opțional: completați ADMIN_PASSWORD
docker compose up -d --build
docker compose logs site      # parola generată, dacă nu ați setat ADMIN_PASSWORD
```

Datele se păstrează într-un volum Docker (`date`, montat la `/data`). Dacă în fața aplicației folosiți un proxy cu HTTPS (nginx, Caddy, Traefik), setați `TRUST_PROXY=1`.

> Fișierele `Dockerfile`, `docker-compose.yml` și `render.yaml` sunt scrise după documentația oficială, dar nu au putut fi rulate în mediul în care a fost construit proiectul. La prima utilizare, verificați că serviciul pornește și că `/healthz` răspunde „ok”.

**HTTPS este obligatoriu** pe un server public: parola și sesiunea circulă între browser și server. Platformele de mai sus oferă HTTPS automat. Pe un server propriu folosiți Caddy sau nginx cu un certificat Let's Encrypt și setați `TRUST_PROXY=1`.

**Mutarea conținutului de pe calculator pe server:** opriți serverul, copiați `storage/content` și `storage/uploads` în `DATA_DIR` de pe server (sau dezarhivați acolo o copie de siguranță), apoi porniți serverul. Nu copiați `storage/private/`, dacă nu vreți să înlocuiți conturile de pe server.

---

## 6. Variabile de configurare

Se setează în mediul de execuție (panoul găzduirii, `docker-compose.yml`) sau într-un fișier `.env` (modelul este `.env.example`; variabilele din sistem au prioritate).

| Variabilă | Implicit | Rol |
|---|---|---|
| `PORT` | `3000` | Portul serverului |
| `HOST` | `0.0.0.0` | Adresa de ascultare (`127.0.0.1` = doar acest calculator) |
| `DATA_DIR` | `storage/` din proiect | Folderul datelor (conținut, fișiere încărcate, conturi). Pe găzduire: un folder de pe discul persistent |
| `ADMIN_USER` | `admin` | Numele primului cont, doar la prima pornire |
| `ADMIN_PASSWORD` | generată și afișată în consolă | Parola primului cont (minimum 10 caractere), doar la prima pornire |
| `TRUST_PROXY` | gol | Setați `1` în spatele unui proxy cu HTTPS. Fără el, cookie-ul de sesiune nu este marcat „Secure”, iar limitarea încercărilor de autentificare se aplică proxy-ului |
| `COOKIE_SECURE` | automat | `true` / `false` forțează sau dezactivează atributul „Secure” al cookie-ului |
| `SESSION_HOURS` | `8` | Durata sesiunii de administrare |
| `MAX_IMAGE_MB` | `15` | Dimensiunea maximă a unei fotografii |
| `MAX_DOC_MB` | `50` | Dimensiunea maximă a unui document |
| `ENV_FILE` | `.env` | Calea altui fișier de configurare |

---

## 7. Datele, copiile de siguranță și restaurarea

Tot ce se modifică din panou se păstrează în `DATA_DIR` (implicit `storage/`):

```
storage/
├── content/        news.json, documents.json, events.json, legal.json,
│                   programs.json, gallery.json, settings.json
├── uploads/
│   ├── img/        fotografii și miniaturi
│   └── docs/       documente încărcate
└── private/        users.json (parole criptate), session.key, audit.log   ← nu se pune pe GitHub
```

- **Copie de siguranță:** în panou, „Publicare și copii” → „Descarcă copia de siguranță (ZIP)”. Conține `content/` și `uploads/` (inclusiv ciornele), fără parole. Faceți o copie periodic, mai ales înainte de modificări mari.
- **Restaurare:** opriți aplicația, dezarhivați copia peste `DATA_DIR`, porniți din nou aplicația.
- Fișierele încărcate și nefolosite (de exemplu o fotografie încărcată și abandonată fără a salva) se șterg automat după 24 de ore. Un fișier șters din panou este eliminat și de pe disc.
- Scrierea fișierelor este atomică: o oprire bruscă a serverului nu corupe conținutul.

---

## 8. Securitate

- Parolele se păstrează criptat (bcrypt), niciodată în clar. Mesajul de eroare la autentificare nu arată dacă utilizatorul există.
- După 8 încercări greșite în 15 minute, autentificarea este blocată temporar pentru acea adresă.
- Sesiunea este un cookie semnat, `HttpOnly`, `SameSite=Strict` (și `Secure` pe HTTPS), valabil 8 ore. Schimbarea parolei închide toate celelalte sesiuni.
- Orice modificare cere un jeton CSRF și o origine corectă a cererii.
- Fișierele încărcate sunt verificate după conținut (nu doar după extensie), primesc nume aleatorii și sunt acceptate doar tipurile din lista de mai sus. **Fișierele SVG nu sunt acceptate** (pot conține cod).
- Antete de securitate (Content-Security-Policy fără JavaScript inline, `nosniff`, `frame-ancestors` etc.) prin `helmet`; pagina `/admin/` nu este indexată de motoarele de căutare.
- Textul introdus în panou este curățat la afișare: se acceptă doar formatarea simplă (paragrafe, liste, titluri, text aldin, legături). HTML-ul nu este interpretat, deci nu poate executa cod în pagină.
- Orice acțiune de administrare se înregistrează în jurnalul de activitate.

Bune practici: schimbați parola generată, folosiți o parolă lungă și unică, serviți pagina doar prin HTTPS, faceți copii de siguranță și țineți Node.js și dependențele actualizate (`npm audit`, `npm update`).

---

## 9. Structura proiectului

```
server.js              pornirea serverului Express, antete de securitate
lib/                   logica serverului: api.js (rutele de administrare), auth.js (parole, sesiuni),
                       store.js (stocarea în fișiere JSON), uploads.js (încărcări), schemas.js (validări),
                       public.js (datele publice), static-site.js (versiunea statică), audit.js, config.js
web/index.html         pagina publică
web/admin/             panoul de administrare (index.html)
web/assets/            css/, js/ (site.js, common.js, admin-*.js), fonts/ (Literata, Atkinson), img/ (sigla)
seed/                  conținutul de pornire (copiat în DATA_DIR la prima pornire)
scripts/               build-static.js (versiunea statică), set-password.js (resetarea parolei)
test/                  teste automate
.github/workflows/     teste și publicare pe GitHub Pages
Dockerfile, docker-compose.yml, render.yaml, .env.example
```

---

## 10. Teste

```bash
npm test
```

Cele peste 25 de teste automate pornesc serverul cu un folder de date temporar și verifică, printre altele: autentificarea și limitarea încercărilor, protecția CSRF, validările în română, încărcările periculoase (fișiere false, SVG, nume cu `../`), curățarea fișierelor la ștergere, accesul interzis la datele private, copia de siguranță, exportul static (fără ciorne, cu căi relative), scripturile din `scripts/` și citirea fișierului `.env`.

---

## 11. Limite cunoscute

- Aplicația rulează într-un singur proces, cu date în fișiere JSON. Este potrivită pentru o pagină instituțională (sute sau mii de înregistrări), nu pentru mai multe instanțe care scriu în același folder de date.
- Toți administratorii au aceleași drepturi; nu există roluri sau flux de aprobare.
- Fișierele încărcate nu sunt scanate cu antivirus; se verifică doar tipul lor.
- Textele de prezentare scrise special pentru această pagină (titlul de pe prima pagină, descrierile nivelurilor de cooperare și ale programelor) trebuie revizuite și aprobate de instituție; restul conținutului provine din gov.md, preluat în octombrie 2026, și trebuie verificat periodic față de sursa oficială.
- Formularul de contact deschide programul de e-mail al vizitatorului (`mailto:`); nu trimite mesaje de pe server.
- Harta din secțiunea Contacte este încorporată de la Google; este singurul serviciu extern al paginii.

---

## 12. Surse și licențe

- **Conținut:** paginile oficiale [gov.md](https://gov.md), disponibile sub licența [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ro) (atribuire, distribuire în condiții identice). Mențiunea apare în subsolul paginii; păstrați-o.
- **Sigla:** emblema Guvernului Republicii Moldova (fișier furnizat de beneficiar); drepturile aparțin Guvernului.
- **Fonturi:** [Literata](https://fonts.google.com/specimen/Literata) și [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/), ambele sub licența SIL Open Font License 1.1 (textele licențelor sunt în `web/assets/fonts/`).
- **Dependențe:** Express, helmet, compression, multer, express-rate-limit, bcryptjs, archiver, fiecare cu licența proprie (MIT sau similară).
- **Codul aplicației:** nu are o licență alocată (`UNLICENSED` în `package.json`). Dacă îl publicați într-un depozit public și doriți să permiteți reutilizarea, adăugați un fișier `LICENSE`.
