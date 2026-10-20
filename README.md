# Direcția Generală Coordonare Asistență Externă și Fonduri Europene

Pagina direcției din cadrul Cancelariei de Stat a Republicii Moldova, cu **panou de administrare**: după autentificare se pot adăuga și modifica texte, documente, fotografii, știri, evenimente și acte normative, fără cunoștințe de programare.

Conținutul de pornire provine din paginile oficiale [gov.md](https://gov.md) (cadrul legal, cooperarea externă, programele de cooperare transfrontalieră, transnațională și interregională, evenimente) și din două documente ale direcției: Regulamentul de activitate (aprilie 2026) și Raportul „Priorități DCAEPI” din 15.10.2026 (funcțiile, structura, drepturile și responsabilitățile direcției, proiectele din Planul de creștere).

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

**Pagina publică** (`/`): stil instituțional (albastru regal, bandă de prezentare cu titlu mare, secțiuni alternate alb / gri deschis, carduri cu margine albastră, cronologie la evenimente), cu sigla Guvernului, bară de accesibilitate (mărire text, contrast ridicat) și secțiunile Noutăți, **Despre direcție** (principiile de activitate, cele opt funcții de bază cu atribuțiile lor, structura direcției, drepturile și responsabilitățile, după Regulamentul de activitate), **Investiții** (Planul de creștere: cele 19 proiecte, grupate pe cele cinci obiective economice ale Planului, doar cu date generale — ministerul responsabil, partenerul de finanțare, valoarea, perioada, localizarea, obiectivele și rezultatele preconizate — după fișele proiectelor și prezentările ministerelor; fără stare sau progres), Cadrul legal, Cooperare externă, Programe, Documente (cu filtre și căutare), Evenimente, **Galerie foto** (cu vizualizare mărită) și Contacte, plus căutare în tot conținutul (`Ctrl + K`), inclusiv în proiecte și funcții.

**Panoul de administrare** (`/admin/`): autentificare cu utilizator și parolă pe server sau, **gratuit, direct pe GitHub Pages**, cu un jeton de acces GitHub (vezi 5.3). Apoi:

- gestionarea știrilor, documentelor (cu încărcare de fișiere), fotografiilor, evenimentelor, actelor normative, programelor și a **proiectelor de investiții** din Planul de creștere;
- editarea textelor paginii (titlu, prezentare, funcțiile, structura, drepturile și responsabilitățile direcției, introducerea și nota Planului de creștere, contacte, subsol);
- schimbarea parolei, jurnal de activitate, copie de siguranță și export pentru GitHub Pages.

**Versiunea statică** (doar citire): aceeași pagină publică, fără server, pentru GitHub Pages sau orice găzduire de fișiere (`npm run build:static`). Cu opțiunea `--github-repo`, aceeași construire include și panoul de administrare care salvează direct în depozitul GitHub (fluxul `pages.yml` o folosește).

Tehnologie: Node.js și Express (pe server); datele se păstrează în fișiere JSON, fără bază de date. Pe GitHub Pages panoul rulează numai în browser și scrie aceleași fișiere JSON în depozit. Pagina publică folosește un singur serviciu extern, harta Google din secțiunea Contacte; fonturile și sigla sunt incluse în proiect. Panoul de pe GitHub Pages comunică, în plus, doar cu `api.github.com`.

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

Acest capitol privește varianta cu server (pe calculator, Render, Docker). Pe **GitHub Pages** nu există utilizator și parolă: conectarea se face cu un jeton GitHub (vezi 5.3).

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
| **Proiecte investiționale** | Proiectele din Planul de creștere, **numai date generale**: denumirea și numărul din listă, obiectivul economic (una dintre cele cinci grupe), ministerul responsabil, instituția de implementare, partenerul de finanțare, valoarea indicativă (în milioane de EUR, USD sau MDL; cu mențiunea „max.” sau „circa”, dacă este cazul), structura finanțării, perioada, localizarea, beneficiarii, obiectivul și descrierea, rezultatele preconizate (câte unul pe rând) și legături utile. Starea, progresul, etapa și întârzierile nu se țin în panou. Valoarea se scrie cu virgulă sau cu punct (de exemplu `151,5`). Căsuța „Publicat” ascunde un proiect de pe pagină fără să-l șteargă |
| **Texte pagină** | Titlul și prezentarea de pe prima pagină, „Despre direcție” (principii, funcții de bază, structură, drepturi, responsabilități), „Planul de creștere” (data actualizării datelor, introducere, notă explicativă, surse), datele de contact, harta, subsolul |
| **Publicare și copii** | Export pentru GitHub Pages și copie de siguranță |
| **Jurnal de activitate** | Cine și când a modificat ce |
| **Cont și parolă** | Schimbarea parolei |

Numerele din secțiunea „Planul de creștere” (numărul total de proiecte și câte proiecte are fiecare obiectiv economic) **se calculează automat din proiecte**; nu se scriu de mână, deci rămân corecte când adăugați, mutați sau ascundeți un proiect. Vizitatorii pot căuta în listă (denumire, minister, partener de finanțare), o pot filtra pe obiective și o pot ordona după numărul din listă, valoare, minister sau obiectiv.

Fotografiile sunt pregătite automat în browser, înainte de încărcare: se redimensionează (maximum 2000 px), se convertesc în JPEG (cu excepția GIF-urilor animate), se creează o miniatură și se elimină datele EXIF, inclusiv locația GPS. Prima dată, galeria conține șase **imagini de exemplu** (marcate „Imagine de exemplu”), pe care le puteți șterge dintr-un clic din panou, după ce încărcați fotografii reale.

Când un administrator este autentificat și deschide pagina publică, apare o bară cu legături rapide și, lângă fiecare element, legătura „Editează”.

---

## 5. Publicarea pe GitHub — citiți înainte de a începe

### 5.1 Ce poate și ce nu poate GitHub

GitHub păstrează codul și îl publică gratuit ca **site static** (GitHub Pages). Un site static nu are server și nu poate verifica parole, dar panoul de administrare nu are nevoie de unul: rulează în browser și **salvează modificările direct în depozitul GitHub**, prin API-ul GitHub, după care GitHub reconstruiește singur pagina publică (1–2 minute).

Aveți trei variante:

| Varianta | Administrare online | Cost | Potrivită când |
|---|---|---|---|
| **A. GitHub Pages cu administrare direct în depozit** (recomandată) | Da, la `…/admin/` pe adresa paginii, cu un jeton de acces GitHub | Gratuit | Una sau mai multe persoane modifică conținutul, fără server |
| **B. GitHub Pages, administrare locală** | Nu: se lucrează pe calculator, apoi se trimit modificările pe GitHub | Gratuit | Conținutul se schimbă rar, de către o singură persoană |
| **C. Server Node cu disc persistent** (Render, Docker pe un server) | Da, la `/admin/`, cu utilizator și parolă | De regulă plătit (disc persistent) | Se dorește autentificare cu parolă proprie, fără conturi GitHub, sau date care nu pot sta într-un depozit |

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

- **Teste** (`ci.yml`): rulează testele automate la fiecare trimitere de modificări de cod (nu și la cele de conținut din `storage/`).
- **Publică pe GitHub Pages** (`pages.yml`): construiește și publică pagina, cu panoul de administrare pentru acest depozit (vezi mai jos).

### 5.3 Varianta A — GitHub Pages cu administrare direct în depozit (gratuit)

Pagina publicată pe GitHub Pages include panoul de administrare, la adresa `https://NUME-UTILIZATOR.github.io/NUME-DEPOZIT/admin/`. Conectarea se face cu un **jeton de acces GitHub** (în loc de utilizator și parolă). Fiecare salvare devine o modificare („commit”) în folderul `storage/` al depozitului, iar fluxul „Publică pe GitHub Pages” reconstruiește pagina în 1–2 minute. Nu este nevoie de server, de card bancar sau de plată.

**Configurare, o singură dată**

1. Aduceți versiunea curentă a proiectului în depozit (vezi 5.2; cu GitHub Desktop: copiați fișierele peste folderul depozitului, apoi **Commit to main** și **Push origin**).
2. În depozit: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Așteptați să se termine fluxul „Publică pe GitHub Pages” (fila **Actions**, bifă verde, 2–3 minute). De acum funcționează pagina publică și `…/admin/`.
4. Creați un jeton de acces (mai jos).
5. Deschideți `…/admin/`, lipiți jetonul și apăsați „Autentificare”.

**Crearea jetonului (pentru proprietarul depozitului)**

1. Intrați în GitHub, apoi deschideți linkul „Deschideți formularul pentru jeton” din ecranul de conectare al panoului (sau: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**).
2. **Resource owner**: contul dumneavoastră (sau organizația care deține depozitul). **Expiration**: cel mult un an; după expirare, panoul cere un jeton nou.
3. **Repository access → Only select repositories** și alegeți depozitul paginii.
4. **Permissions → Repository permissions → Contents: Read and write** (**Metadata: Read-only** se adaugă singur). Nu adăugați alte drepturi.
5. **Generate token** și copiați imediat jetonul (începe cu `github_pat_`): GitHub îl arată o singură dată.

**Alți editori.** Fiecare editor are nevoie de un cont GitHub cu drept de scriere în depozit (**Settings → Collaborators → Add people**) și își creează propriul jeton; în istoric, modificările apar pe numele lui. Jetoanele „fine-grained” pot fi create doar pentru depozitele pe care le dețineți (sau care aparțin unei organizații din care faceți parte); un colaborator la depozitul altcuiva folosește un **jeton clasic** (**Settings → Developer settings → Personal access tokens → Tokens (classic)**, permisiunea `public_repo` pentru un depozit public, `repo` pentru unul privat). Dacă mai mulți oameni editează regulat, mutați depozitul într-o organizație GitHub gratuită.

**Ce se întâmplă la o salvare**

- Indicatorul din bara de sus arată „Se salvează…”, apoi „Se publică…” și, după 1–2 minute, „Publicat”. Pagina „Publicare și copii” arată starea publicării și are butonul „Republică pagina”.
- Prima salvare creează folderul `storage/` din conținutul de pornire; de atunci, pagina se construiește din `storage/`.
- Mai multe modificări făcute odată (ștergerea sau mutarea mai multor fotografii) se salvează într-o singură modificare în depozit; încărcarea mai multor fotografii creează câteva.
- Dacă altcineva modifică depozitul în același timp (alt editor sau un `push` de pe calculator), panoul îmbină singur modificările; dacă nu reușește, spune ce să faceți.
- Jurnalul de activitate arată ultimele modificări din istoricul depozitului: cine, când, ce.

**Dacă ați greșit.** Nimic nu se pierde: fiecare versiune rămâne în istoricul GitHub. În GitHub Desktop: fila **History** → clic dreapta pe modificarea greșită → **Revert Changes in Commit** → **Push origin**. Pe github.com: **Commits** → modificarea → **Revert**.

**Lucrul pe calculator în paralel.** Dacă modificați și fișiere de pe calculator (cod sau texte), faceți mai întâi **Fetch origin / Pull origin** în GitHub Desktop, ca să aduceți modificările făcute din panou. Altfel, trimiterea poate fi refuzată.

**Securitate**

- Jetonul este ca o parolă pentru depozit: oricine îl are poate modifica pagina. Nu îl trimiteți nimănui și nu îl scrieți în documente. Alegeți expirare și drepturi doar pentru acest depozit.
- Jetonul se păstrează doar în browserul dumneavoastră (în fila curentă sau, dacă bifați „Păstrează conectarea”, pe acel calculator) și se trimite doar către `api.github.com`. Nu bifați „Păstrează conectarea” pe un calculator folosit de mai multe persoane. „Ieșire” îl șterge din browser.
- Toate paginile publicate pe același cont (`NUME-UTILIZATOR.github.io`) împart același spațiu de stocare al browserului. Nu găzduiți pe același cont pagini în care nu aveți încredere.
- Dacă ați pierdut jetonul sau credeți că a ajuns la altcineva, ștergeți-l în GitHub (**Settings → Developer settings → Personal access tokens**); încetează imediat să mai funcționeze.
- Într-un **depozit public**, tot ce se află în `storage/` (inclusiv ciornele de știri) poate fi citit de oricine, direct în depozit. Pagina publicată arată însă doar elementele publicate.

**Limite**

- Autentificarea este cea a GitHub: nu există conturi sau parole proprii ale paginii. Secțiunea „Cont și parolă” devine „Cont GitHub”.
- Fotografiile (până la 15 MB) se pregătesc în browser (maximum 2000 px), documentele pot avea până la 25 MB. Un depozit GitHub ar trebui să rămână sub 1 GB, iar un site GitHub Pages poate avea cel mult 1 GB.
- GitHub limitează numărul de cereri; la încărcări foarte mari panoul așteaptă singur câteva secunde și continuă.
- Panoul nu funcționează fără conexiune la internet. Ce nu s-a salvat încă se pierde dacă închideți fila (panoul vă avertizează).
- Pentru depozite private, GitHub Pages cere un plan plătit GitHub, iar fluxurile GitHub Actions consumă din cota lunară gratuită a contului.

> Această variantă a fost verificată automat pe un simulator al API-ului GitHub (`test-support/mock-github.js`) și în browser, nu pe github.com. La prima utilizare, faceți o modificare de probă (de exemplu o știre de test) și urmăriți indicatorul „Publicat”.

**Pagina arată în continuare versiunea veche?** Verificați în fila **Actions** că ultimul flux „Publică pe GitHub Pages” s-a terminat cu bifă verde, apoi reîncărcați pagina cu `Ctrl + F5`. Dacă fluxul a eșuat, deschideți-l și citiți mesajul roșu; apăsați „Re-run all jobs” după ce îl rezolvați.

**Mesaje frecvente din panou**

| Mesaj | Ce înseamnă |
|---|---|
| „Jetonul GitHub nu este valabil” | Jetonul este greșit, a expirat sau a fost șters. Creați altul. |
| „Nu am găsit pe GitHub depozitul …” | Jetonul nu are acces la depozitul paginii: la „Repository access” alegeți depozitul. |
| „Jetonul nu are voie să modifice depozitul” | Lipsește permisiunea **Contents: Read and write**. |
| „Depozitul a fost modificat în același timp de altcineva …” | Mai mulți editori au salvat deodată; reîncercați peste câteva secunde. |
| „Ramura … este protejată” | Pe ramura publicată există reguli care cer „pull request”; dezactivați-le pentru administratori. |
| „GitHub a limitat temporar numărul de cereri …” | GitHub a pus o scurtă pauză (indicatorul arată „Pauză GitHub”). Panoul reia singur; dacă mesajul rămâne, reîncercați peste câteva minute. |
| „Organizația cere autorizarea jetonului … (SSO)” | Depozitul aparține unei organizații cu conectare unică: în GitHub, la lista de jetoane, apăsați „Configure SSO” → „Authorize”. |
| „GitHub nu răspunde momentan” | Problemă temporară la GitHub; reîncercați peste câteva minute. Ce ați completat rămâne în formular. |

### 5.4 Varianta B — GitHub Pages, administrare locală

1. În depozitul GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (o singură dată).
2. La următorul `push` pe ramura `main`, fluxul „Publică pe GitHub Pages” construiește pagina și o publică. Adresa apare în **Settings → Pages**, de regulă `https://NUME-UTILIZATOR.github.io/NUME-DEPOZIT/`. Prima publicare durează câteva minute.

Fluxul publică conținutul din folderul `storage/` dacă acesta există în depozit, altfel conținutul de pornire din `seed/`. Când versiunea paginii este mai nouă decât ce aveți în `storage/` (de exemplu aduce proiecte sau texte noi), conținutul nou din `seed/` se adaugă la construire peste `storage/`, fără să șteargă modificările dumneavoastră (vezi 7.1). Pagina publicată include și panoul de administrare de la `…/admin/` (varianta A); dacă nu îl folosiți, pur și simplu nu vă conectați la el.

**Cum se actualizează pagina:**

```bash
npm start                                  # lucrați în http://localhost:3000/admin/
# opriți serverul (Ctrl + C), apoi:
git add storage/content storage/uploads
git commit -m "Actualizare conținut"
git push
```

Pagina publică se actualizează singură în 1–2 minute. (Nu adăugați `storage/private/`; este exclus automat.)

**Variantă fără GitHub Actions:** în panou, secțiunea „Publicare și copii” → „Descarcă exportul static (ZIP)”. Dezarhivați și încărcați conținutul în rădăcina unui depozit separat, apoi **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**. Același export se poate face din linia de comandă: `npm run build:static` (rezultatul apare în `dist/`; opțiuni: `--data <folder>` și `--out <folder>`). Cu `--github-repo UTILIZATOR/DEPOZIT` (și, după caz, `--github-branch`) exportul include panoul de administrare care salvează direct în acel depozit, exact ca fluxul `pages.yml`.

**De știut:**

- Versiunea statică funcționează și într-un subfolder (`utilizator.github.io/depozit/`) și se poate deschide direct din fișier (`index.html`), fără server.
- Pagina publicată include **doar** elementele publicate; ciornele nu apar. Dar fișierul `storage/content/news.json` le conține, deci într-un **depozit public** ciornele pot fi citite în depozit. Păstrați ciornele doar pe server sau nu încărcați `storage/` într-un depozit public.
- Site-urile GitHub Pages sunt publice. Pentru depozite private, GitHub Pages cere un plan plătit GitHub.
- Căutarea, galeria, filtrele și formularul de contact funcționează și în versiunea statică. Fișierele încărcate din panou ajung în `uploads/`.

### 5.5 Varianta C — server cu administrare online

Aplicația trebuie să ruleze pe un server Node.js (sau în Docker) cu **un disc persistent** montat la folderul de date (`DATA_DIR`). Fără disc persistent, tot ce se introduce din panou se pierde la reînnoirea serviciului. Pagina trebuie servită de la **rădăcina unui domeniu sau subdomeniu** (de ex. `https://exemplu.md/`), nu dintr-un subfolder.

**Render** (cel mai simplu, direct din depozitul GitHub). Cost orientativ în octombrie 2026: aproximativ 7 USD pe lună pentru serviciu (0,5 CPU, 512 MB) și aproximativ 0,25 USD pe lună pentru discul de 1 GB; Render cere un card bancar. Verificați prețul curent pe [render.com/pricing](https://render.com/pricing) înainte de a confirma.

1. Depozitul GitHub trebuie să conțină versiunea curentă a proiectului, inclusiv fișierul `render.yaml` din rădăcină.
2. Deschideți `https://render.com/deploy?repo=https://github.com/NUME-UTILIZATOR/NUME-DEPOZIT` (cu adresa depozitului dumneavoastră) sau, în Render, **New → Blueprint** și alegeți depozitul. Vă autentificați cu contul GitHub sau cu e-mail. Depozitele private cer instalarea aplicației Render pentru GitHub.
3. Render afișează serviciul `dgaefe-site` (Web Service, regiunea Frankfurt, 0,5 CPU / 512 MB, disc de 1 GB). Completați `ADMIN_PASSWORD` (minimum 10 caractere; cu ea veți intra în administrare) și adăugați cardul când vi se cere.
4. Confirmați cu butonul de la finalul paginii (de obicei **Deploy Blueprint**). Prima construire durează 3–5 minute, apoi starea serviciului devine **Live**.
5. Deschideți adresa serviciului (de forma `https://dgaefe-site.onrender.com`, afișată în partea de sus a paginii serviciului) și intrați la `/admin/` cu utilizatorul `admin` și parola de la pasul 3. Schimbați apoi parola din „Cont și parolă”.
6. Opțional, adresă proprie: în Render, **Settings → Custom Domains**.

Ce trebuie știut despre Render:

- Discurile persistente sunt disponibile doar pentru servicii cu plan plătit, iar un serviciu cu disc nu poate rula pe mai multe instanțe. Pe planul gratuit administrarea ar funcționa, dar modificările s-ar pierde la fiecare repornire (serviciul gratuit adoarme după 15 minute fără vizite).
- Discul se poate mări ulterior din pagina serviciului, dar nu se poate micșora.
- La o reînnoire a serviciului (de exemplu după o modificare trimisă pe GitHub) site-ul este indisponibil câteva secunde. Conținutul din panou rămâne pe disc.
- Regiunea (Frankfurt) nu se mai poate schimba după crearea serviciului.
- `TRUST_PROXY=render` (deja setat în `render.yaml`) este necesar: Render trimite vizitatorii printr-un lanț de proxy-uri, iar fără această setare toți vizitatorii ar apărea cu aceeași adresă, deci câteva parole greșite ale unor roboți ar bloca temporar autentificarea tuturor.
- Pe Render, adresa de pe GitHub Pages (dacă o folosiți) **nu se actualizează singură** cu ce editați în panou. Alegeți una dintre adrese ca pagină oficială. Dacă nu mai doriți versiunea de pe GitHub Pages, dezactivați fluxul „Publică pe GitHub Pages” din fila Actions a depozitului.
- Faceți periodic o copie de siguranță din panou („Publicare și copii”).

Serviciul se poate crea și manual (Web Service, `npm ci` / `npm start`, variabilele din secțiunea 6, un Disk montat la `/var/data`). Alte platforme cu volume persistente (Railway, Fly.io) funcționează după același model, cu `TRUST_PROXY=1`.

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
| `TRUST_PROXY` | gol | Setați `1` în spatele unui proxy cu HTTPS (nginx, Caddy, Railway, Fly.io) și `render` pe Render. Fără el, cookie-ul de sesiune nu este marcat „Secure”, iar limitarea încercărilor de autentificare se aplică proxy-ului, nu fiecărui vizitator |
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
│                   programs.json, gallery.json, investments.json, settings.json
├── uploads/
│   ├── img/        fotografii și miniaturi
│   └── docs/       documente încărcate
└── private/        users.json (parole criptate), session.key, audit.log   ← nu se pune pe GitHub
```

- **Copie de siguranță:** în panou, „Publicare și copii” → „Descarcă copia de siguranță (ZIP)”. Conține `content/` și `uploads/` (inclusiv ciornele), fără parole. Faceți o copie periodic, mai ales înainte de modificări mari.
- **Restaurare:** opriți aplicația, dezarhivați copia peste `DATA_DIR`, porniți din nou aplicația.
- **Pe GitHub Pages (varianta A)** datele se află în depozit, în `storage/content` și `storage/uploads`, iar copia de siguranță este istoricul GitHub: orice versiune anterioară se poate reface (vezi 5.3). Pagina „Publicare și copii” oferă și descărcarea întregului depozit (ZIP) de la GitHub.
- Fișierele încărcate și nefolosite (de exemplu o fotografie încărcată și abandonată fără a salva) se șterg automat după 24 de ore. Un fișier șters din panou este eliminat și de pe disc.
- Scrierea fișierelor este atomică: o oprire bruscă a serverului nu corupe conținutul.

### 7.1 Versiuni noi ale paginii și conținutul deja salvat

Când o versiune nouă a paginii aduce conținut nou (de exemplu proiectele din Planul de creștere sau acte normative în plus), acesta ajunge și la cine are deja conținut salvat, **fără să se piardă ce ați modificat**. Regulile sunt aceleași pe server, în versiunea statică și în panoul de pe GitHub Pages (`web/assets/js/content-overlay.js`):

- o colecție care lipsește din `storage/content/` (de exemplu `investments.json`) se ia din `seed/content/`;
- `settings.json` poartă versiunea conținutului de pornire (`seedRev`). Dacă este mai veche decât cea din `seed/content/settings.json`, cheile de text care lipsesc se completează, iar textele rămase **neschimbate** față de vechea valoare implicită se înlocuiesc cu cele noi (lista este în `seed/upgrades.json`). **Un text modificat de dumneavoastră nu se atinge niciodată**;
- înregistrările noi, listate în `seed/upgrades.json` (de exemplu actele normative noi), se adaugă o singură dată, dacă nu există deja un act cu același tip, număr și an; ce ștergeți ulterior nu mai revine;
- proiectele salvate în forma veche (cu stare, progres, etapă, întârzieri sau „pasul următor”) pierd o singură dată aceste câmpuri (versiunea 4 a conținutului de pornire). Pentru proiectele din Planul de creștere, descrierea se înlocuiește cu cea din fișele proiectelor, iar obiectivul economic, instituția de implementare, partenerul de finanțare, structura finanțării, perioada, localizarea, rezultatele și beneficiarii se completează dacă lipsesc; denumirea, ministerul, valoarea și legăturile rămân cele salvate de dumneavoastră. Un proiect adăugat de dumneavoastră pierde doar câmpurile de stare și progres;
- pe server completările se scriu în `storage/content/` la prima pornire; în varianta A ele apar imediat în panou și se scriu în depozit odată cu prima salvare; la construirea versiunii statice se aplică la fiecare construire, fără să se scrie nimic în `storage/`.

---

## 8. Securitate

- Parolele se păstrează criptat (bcrypt), niciodată în clar. Mesajul de eroare la autentificare nu arată dacă utilizatorul există.
- După 8 încercări greșite în 15 minute, autentificarea este blocată temporar pentru acea adresă.
- Sesiunea este un cookie semnat, `HttpOnly`, `SameSite=Strict` (și `Secure` pe HTTPS), valabil 8 ore. Schimbarea parolei închide toate celelalte sesiuni.
- Orice modificare cere un jeton CSRF și o origine corectă a cererii.
- Fișierele încărcate sunt verificate după conținut (nu doar după extensie), primesc nume aleatorii și sunt acceptate doar tipurile din lista de mai sus. **Fișierele SVG nu sunt acceptate** (pot conține cod).
- Antete de securitate (Content-Security-Policy fără JavaScript inline, `nosniff`, `frame-ancestors` etc.) prin `helmet`; pagina `/admin/` nu este indexată de motoarele de căutare.
- Textul introdus în panou este curățat la afișare: se acceptă doar formatarea simplă (paragrafe, liste, titluri, text aldin, legături). HTML-ul nu este interpretat, deci nu poate executa cod în pagină.
- Orice acțiune de administrare se înregistrează în jurnalul de activitate (pe GitHub Pages: în istoricul depozitului).
- Pe GitHub Pages panoul rulează cu o politică de securitate proprie (scripturi doar din pagină, conexiuni doar către `api.github.com`), se ascunde singur dacă este încadrat în altă pagină și păstrează jetonul doar în browser (vezi 5.3).

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
web/assets/            css/, js/ (site.js, common.js, admin-*.js), fonts/ (Raleway, Roboto), img/ (sigla)
                       admin-schemas.js (validările, comune serverului și browserului), admin-github-core.js
                       (salvarea în depozitul GitHub) și admin-github.js (conectarea, indicatorul de publicare);
                       content-overlay.js (îmbinarea conținutului de pornire cu cel salvat, vezi 7.1)
seed/                  conținutul de pornire (copiat în DATA_DIR la prima pornire); upgrades.json descrie ce se
                       schimbă la cei care au deja conținut salvat (vezi 7.1)
scripts/               build-static.js (versiunea statică), set-password.js (resetarea parolei)
test/                  teste automate
test-support/          simulatorul API-ului GitHub și conținutul „vechi” reconstituit pentru teste
.github/workflows/     teste și publicare pe GitHub Pages
Dockerfile, docker-compose.yml, render.yaml, .env.example
```

---

## 10. Teste

```bash
npm test
```

Cele peste 90 de teste automate pornesc serverul cu un folder de date temporar și verifică, printre altele: autentificarea și limitarea încercărilor, protecția CSRF, validările în română, încărcările periculoase (fișiere false, SVG, nume cu `../`), curățarea fișierelor la ștergere, accesul interzis la datele private, copia de siguranță, exportul static (fără ciorne, cu căi relative), scripturile din `scripts/` și citirea fișierului `.env`. Alte teste verifică proiectele din Planul de creștere (validări, valorile scrise cu virgulă, respingerea câmpurilor de stare și progres, ascundere, export, migrarea proiectelor salvate în forma veche), regulile de îmbinare a conținutului nou cu cel salvat (`test/overlay.test.js`: un text modificat de administrator rămâne, ce se șterge nu revine, a doua aplicare nu schimbă nimic) și coerența conținutului livrat (cele cinci obiective economice, identificatorii din `seed/upgrades.json`, lipsa câmpurilor de stare în conținutul public).

Administrarea direct pe GitHub se verifică pe un simulator al API-ului GitHub (`test-support/mock-github.js`): conectare, bootstrap la prima salvare, fișiere încărcate, operațiuni în bloc într-un singur commit, modificări simultane ale altcuiva, limitări și erori ale GitHub, jeton expirat, jurnal și starea publicării. Un test rulează aceeași succesiune de operațiuni pe serverul real și pe varianta GitHub și compară rezultatele și conținutul salvat.

---

## 11. Limite cunoscute

- Pe GitHub Pages (varianta A) fiecare salvare este o modificare în depozit și depinde de disponibilitatea GitHub; panoul respectă limitele de cereri ale GitHub. Varianta a fost verificată pe un simulator, nu pe github.com.
- Aplicația rulează într-un singur proces, cu date în fișiere JSON. Este potrivită pentru o pagină instituțională (sute sau mii de înregistrări), nu pentru mai multe instanțe care scriu în același folder de date.
- Toți administratorii au aceleași drepturi; nu există roluri sau flux de aprobare.
- Fișierele încărcate nu sunt scanate cu antivirus; se verifică doar tipul lor.
- Textele de prezentare scrise special pentru această pagină (titlul de pe prima pagină, descrierile nivelurilor de cooperare și ale programelor) trebuie revizuite și aprobate de instituție; restul conținutului provine din gov.md, preluat în octombrie 2026, și trebuie verificat periodic față de sursa oficială.
- Datele generale ale celor 19 proiecte provin din fișele proiectelor și din prezentările ministerelor primite de la beneficiar; Raportul „Priorități DCAEPI” (15.10.2026) a stabilit lista și ordinea. Sursele nu se potrivesc peste tot; în listă s-a păstrat valoarea din fișa proiectului (denumirile au fost aliniate la fișe) și s-au notat în descriere sumele totale. Merită confirmate cu ministerele: **HiTech Park** (fișa: 276,4 mil. EUR în total; prezentarea: 137 + 21 mil. EUR; în listă: tranșa 1a de 77 mil. EUR), **Moldova Roads VI** (în listă 232,1 mil. EUR pentru R7 și M3, costul total fiind de circa 400 mil. EUR), **Autostrada** (în listă 300 mil. EUR pentru sectorul Ungheni–Chișinău, față de 1.250 mil. EUR în prezentare și 22.884 mil. MDL în fișă), lungimea **centurii Chișinăului** (47, 54 sau 57 km), **spitalul de la Bălți** (116,98 mil. EUR în fișă, 108 mil. EUR în studiul de fezabilitate), **AGRI-M** (43,39 mil. USD; prezentarea indică 43,5 mil. EUR, fișa 38,3 mil. USD; începutul este amânat, perioada afișată fiind 2028–2032), valoarea **SACET** (53,3 sau 52,7 mil. EUR), cea a **rețelei de transport al energiei electrice** (71,5 sau 78,0 mil. EUR), cea a **deșeurilor periculoase** (58,35; 58,3 sau 58,5 mil. EUR) și perioada **școlilor** (2026–2032 în prezentare, 2030 în fișă). Totalurile Planului de creștere din documentele primite nu coincid între ele (2.873,8 sau 2.878,6 mil. EUR), de aceea pagina nu afișează un total. Datele se schimbă: actualizați proiectele din panou și data actualizării din „Texte pagină”; un proiect se poate ascunde cu căsuța „Publicat”.
- Alte opt fișe de proiect primite nu fac parte din lista celor 19 și **nu au fost publicate**: Bălți District Heating Phase III, reabilitarea edificiului Circului din Chișinău, parcurile industriale, infrastructura sportivă, drumurile locale, terminalul logistic multimodal Chișinău, extinderea portului Giurgiulești și linia de cale ferată electrificată Ungheni–Chișinău. Dacă trebuie să apară pe pagină, le puteți adăuga din panou, la „Proiecte investiționale” (butonul „Adaugă proiect”). Fișele terminalului multimodal Chișinău și ale portului Giurgiulești arată aceeași valoare, 1.021,3 mil. MDL; verificați-o înainte de a le publica.
- Din Raport și din Regulament nu s-au preluat numele persoanelor, legăturile către rapoartele interne (Power BI) și numărul de înregistrare al Regulamentului. Cele opt acte normative adăugate din Regulament nu au încă legături către textul lor; se pot completa din panou, la „Cadrul legal”.
- Formularul de contact deschide programul de e-mail al vizitatorului (`mailto:`); nu trimite mesaje de pe server.
- Harta din secțiunea Contacte este încorporată de la Google; este singurul serviciu extern al paginii publice.

---

## 12. Surse și licențe

- **Conținut:** paginile oficiale [gov.md](https://gov.md), disponibile sub licența [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ro) (atribuire, distribuire în condiții identice). Mențiunea apare în subsolul paginii; păstrați-o. Funcțiile, structura, drepturile și responsabilitățile direcției provin din Regulamentul de activitate (aprilie 2026), iar proiectele din Planul de creștere din fișele proiectelor, prezentările ministerelor și Raportul „Priorități DCAEPI” (15.10.2026), documente primite de la beneficiar.
- **Sigla:** emblema Guvernului Republicii Moldova (fișier furnizat de beneficiar); drepturile aparțin Guvernului.
- **Fonturi:** [Raleway](https://fonts.google.com/specimen/Raleway) (titluri, meniu, butoane) și [Roboto](https://fonts.google.com/specimen/Roboto) (text), ambele sub licența SIL Open Font License 1.1 (textele licențelor sunt în `web/assets/fonts/`). Fișierele se servesc din proiect; pagina nu se conectează la Google Fonts.
- **Dependențe:** Express, helmet, compression, multer, express-rate-limit, bcryptjs, archiver, fiecare cu licența proprie (MIT sau similară).
- **Codul aplicației:** nu are o licență alocată (`UNLICENSED` în `package.json`). Dacă îl publicați într-un depozit public și doriți să permiteți reutilizarea, adăugați un fișier `LICENSE`.
