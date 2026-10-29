[English](SETUP.md) | Українська

# Мінімальне локальне налаштування: WSL і Linux

Запустіть бекенд, MongoDB і десктопний застосунок локально, а CSV-файли зберігайте в AWS S3.
Обчислення й оптимізація виконуються в Docker-контейнерах на вашому комп'ютері. AWS Batch,
AWS CLI, Python на хості та окремий сервіс завдань не потрібні.

## 1. Підготовка WSL або Linux

У Windows використовуйте WSL 2 з Ubuntu та WSLg для вікна Electron-застосунку.
В адміністративному PowerShell встановіть WSL, якщо його ще немає:

```powershell
wsl --install -d Ubuntu-24.04
```

Перезапустіть Windows, якщо система попросить, потім відкрийте Ubuntu і завершіть створення користувача Linux.
Для наявного встановлення WSL виконайте `wsl --update` і перевірте `wsl --list --verbose`,
щоб переконатися, що дистрибутив працює у версії 2. Підтримка графічного інтерфейсу вимагає Windows 11 або
Windows 10 зі збіркою 19044+. Дивіться [посібник Microsoft з графічних застосунків у WSL](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps).

У рідному Linux використовуйте звичайний сеанс робочого столу. Усі подальші команди виконуються
в терміналі Linux, зокрема й у WSL. Тримайте репозиторій у домашній теці Linux
(наприклад, `~/projects/classification-pipeline`).

Вам потрібні Git, curl, Node.js 24 з npm 11+, локальний MongoDB і Docker. В Ubuntu:

```bash
sudo apt update
sudo apt install -y git curl
```

Встановіть Node.js 24 через [NVM](https://github.com/nvm-sh/nvm/tree/v0.40.3) або скористайтеся
наявним встановленням, якщо воно відповідає вимогам:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
node --version
npm --version
```

Встановіть MongoDB Community за [офіційною інструкцією для Ubuntu](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/)
або за [інструкцією для вашого дистрибутива Linux](https://www.mongodb.com/docs/manual/administration/install-on-linux/).
У системі з systemd запустіть його й перевірте з'єднання:

```bash
sudo systemctl start mongod
mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

Якщо systemd у WSL недоступний, запустіть MongoDB в окремому терміналі Linux:

```bash
mkdir -p "$HOME/.local/share/classification-pipeline/mongodb"
mongod --dbpath "$HOME/.local/share/classification-pipeline/mongodb" --bind_ip 127.0.0.1 --port 27017
```

### Docker для локальних обчислень

У WSL встановіть і запустіть [Docker Desktop для Windows](https://docs.docker.com/desktop/features/wsl/).
Використовуйте Linux-контейнери, увімкніть **Use WSL 2 based engine** і ввімкніть свій дистрибутив Ubuntu
в **Settings → Resources → WSL Integration**.

У рідному Linux встановіть [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
і налаштуйте [доступ до Docker без sudo](https://docs.docker.com/engine/install/linux-postinstall/),
оскільки застосунок викликає Docker від імені звичайного користувача.

Перевірте в тому самому терміналі Linux, з якого запускатимете застосунок:

```bash
docker version
docker info
```

Обидві команди мають підключатися до демона Docker без `sudo`. Python і його залежності для
обчислень встановлено всередині образів завдань.

## 2. Встановлення залежностей проєкту

Клонуйте репозиторій, якщо ще не зробили цього, і виконайте з його кореня:

```bash
npm install
```

Це встановлює обидва Node.js-воркспейси й генерує типи GraphQL для десктопу.
Використовуйте звичайну команду встановлення, щоб скрипти встановлення Electron могли виконатися.

### Рекомендоване середовище розробки та розширення VS Code

Ubuntu 24.04 LTS з WSL 2 — рекомендоване середовище розробки у Windows,
воно відповідає поточному робочому простору. Рідна Ubuntu 24.04 також підходить для цього
посібника. Тримайте Node.js, залежності, MongoDB і команди проєкту всередині Linux.

У Windows встановіть VS Code на стороні Windows і розширення Microsoft
[WSL](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl).
З кореня репозиторію в терміналі Linux відкрийте весь проєкт:

```bash
code .
```

Переконайтеся, що в рядку стану VS Code показано **WSL: Ubuntu**. Встановлюйте розширення для розробки
в це середовище WSL, коли VS Code пропонує **Install in WSL: Ubuntu**.
У рідному Linux відкрийте той самий корінь репозиторію в локальному VS Code.
Дивіться [посібник VS Code з WSL](https://code.visualstudio.com/docs/remote/wsl).

Ці розширення встановлені в поточному робочому просторі й корисні
для цього проєкту:

| Розширення                                                                                                                                  | Рекомендація                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) (`dbaeumer.vscode-eslint`)                             | Рекомендовано для діагностики JavaScript і TypeScript за конфігураціями ESLint бекенду та десктопу.                   |
| [Prettier ESLint](https://marketplace.visualstudio.com/items?itemName=rvest.vs-code-prettier-eslint) (`rvest.vs-code-prettier-eslint`)      | Рекомендовано для форматування JavaScript і TypeScript за правилами Prettier та ESLint проєкту.                       |
| [GraphQL for VSCode](https://marketplace.visualstudio.com/items?itemName=kumar-harsh.graphql-for-vscode) (`kumar-harsh.graphql-for-vscode`) | Необов'язкове підсвічування синтаксису запитів, мутацій і схем GraphQL.                                                |
| [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens) (`eamodio.gitlens`)                                          | Необов'язкове розширення з історією Git і blame-інформацією під час перегляду змін.                                   |

Використовуйте `.prettierrc`, `backend/.eslintrc.json` і
`desktop/.eslintrc.json` із репозиторію замість окремих особистих правил форматування.
Розширення — це зручність для редактора; вони не є обов'язковими для запуску застосунку.

## 3. Налаштування бекенду та завантаження в S3

Створіть `backend/.env`, якщо його ще немає. Якщо він уже є, оновіть потрібні
значення, не перезаписуючи інші налаштування:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/app
JWT_SECRET=replace-with-a-long-random-secret

BACKEND_CLOUD_WORKER_ENABLED=false
BACKEND_LOCAL_WORKER_ENABLED=true
BACKEND_SERVICE_TOKEN=replace-with-a-long-random-string
BACKEND_GRAPHQL_URL=http://host.docker.internal:4000/graphql

AWS_S3_BUCKET=your-development-bucket
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

Вкажіть у `AWS_REGION` фактичний регіон вашого бакета. Використовуйте бакет для розробки та
облікові дані з дозволом `s3:PutObject` для `arn:aws:s3:::your-development-bucket/uploads/*`.
Для завантаження й видалення файлів також потрібні `s3:GetObject` і `s3:DeleteObject` для
цього префікса. Бекенд генерує [попередньо підписані URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
із цими обліковими даними; десктоп завантажує файли в S3 напряму. Зберігайте облікові дані
в `backend/.env`, який ігнорується Git, і не додавайте їх до конфігурації десктопу.

Черги AWS Batch, визначення завдань, бакети результатів обчислень і кореневий `.env`
для цього налаштування не потрібні.

Запуски виконують два виконавці (worker). Docker-виконавець бекенду
(`BACKEND_LOCAL_WORKER_ENABLED=true`, значення за замовчуванням) обробляє чергу `cloud` і
не потребує AWS Batch; виконавець у десктопі обробляє чергу `local`. Тримайте
`BACKEND_CLOUD_WORKER_ENABLED=false`, якщо ви не використовуєте AWS Batch (у коді за замовчуванням
стоїть `true`, тож без цього значення під час запуску з'явиться попередження про вимкнений хмарний виконавець).
Контейнери, які запускає бекенд, автентифікуються за допомогою `BACKEND_SERVICE_TOKEN`; підійде будь-який довгий
випадковий рядок. Ці самі значення діють і для Compose, і для ручного запуску нижче (Compose сам задає
`MONGODB_URI` і `BACKEND_GRAPHQL_URL`).

### Дозвольте завантаження в бакет із localhost

Розробник або адміністратор бакета має налаштувати правила CORS бакета S3 так, щоб
дозволити запити з localhost. У консолі S3 відкрийте свій бакет, потім
**Permissions → Cross-origin resource sharing (CORS) → Edit**. Додайте це правило до
JSON-масиву, зберігши наявні правила:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

Символ підстановки в origin дозволяє запити з будь-якого джерела, зокрема з localhost на будь-якому
порту. Правило дозволяє всі п'ять HTTP-методів, які підтримує CORS у S3.

S3 сам обробляє попередній запит `OPTIONS`; не додавайте `OPTIONS` до
`AllowedMethods`. Тримайте бакет приватним із ввімкненим Block Public Access:
CORS дозволяє запит браузера, а завантаження авторизують дозволи IAM.
Дивіться [налаштування CORS в AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)
і [поля правил CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html).

## 4. Запуск через Docker Compose (рекомендовано)

Коли Docker запущено, а `backend/.env` створено з `backend/.env.example`
(локальний режим — за замовчуванням; вкажіть `JWT_SECRET`, `BACKEND_SERVICE_TOKEN` і значення для S3), виконайте з кореня:

```bash
docker compose up -d
npm run start:desktop
```

Compose запускає MongoDB (том `mongo-data`), збирає образи `aws-jobs` і
`aws-jobs-optimization` та запускає бекенд на порту 4000. Бекенд
монтує `/var/run/docker.sock`, щоб запускати контейнери обчислень, які звертаються до нього через
`host.docker.internal` (прив'язка через `host-gateway`). Тоді MongoDB і кроки встановлення
на хості, описані вище, непотрібні; бекенд у Compose перевизначає
`MONGODB_URI`.

## 4b. Ручний запуск (без Compose)

З кореня репозиторію запустіть бекенд в одному терміналі:

```bash
npm run start:backend
```

Бекенду потрібні MongoDB (розділ 3) і образи `aws-jobs` та `aws-jobs-optimization`.
Зберіть образи один раз (і після змін в `aws-jobs/`):

```bash
docker compose build aws-jobs aws-jobs-optimization
```

Запустіть десктоп з кореня репозиторію в іншому терміналі Linux:

```bash
npm run start:desktop
```

Десктоп сам запускає локальний виконавець обчислень і готує Docker-образ
`aws-jobs`, збираючи його, якщо він відсутній (і перебудовуючи його під час кожного запуску в
режимі розробки; щоб пропустити перебудову, задайте `LOCAL_WORKER_REBUILD_IMAGE=false`). Виконавець опитує
чергу `local` і виконує запуски, надіслані через застосунок, поки десктоп відкрито.
Приберіть зі свого середовища оболонки чи конфігурації запуску старе перевизначення `LOCAL_WORKER_ENABLED=false`.
Окремий запуск виконавця чи ручна збірка образу не потрібні.
Десктоп за замовчуванням використовує `http://localhost:4000/graphql`, тож `.env` для десктопу
не потрібен. Не запускайте десктоп із `sudo`.

Контейнери звертаються до бекенду за адресою `http://host.docker.internal:4000/graphql`.
Наявні засоби запуску додають прив'язку `host-gateway` для мережі Docker у Linux.
Тримайте бекенд запущеним, поки виконуються обчислення чи оптимізація.

Зупиняйте кожен процес за допомогою `Ctrl+C` у його терміналі.

## 5. Перевірка налаштування

Перевірте бекенд, поки він працює:

```bash
curl -sS http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"{ health }"}'
```

Очікувана відповідь — `{"data":{"health":"ok"}}`. У десктопі зареєструйтеся або увійдіть, потім
завантажте CSV на сторінці Files. Переконайтеся, що файл з'явився в списку файлів і
в теці `uploads/` бакета S3. Облікові дані бекенду також потребують `s3:GetObject`
для `uploads/*`, щоб обчислення могли завантажити набір даних через попередньо підписаний URL.

Щоб перевірити обчислення, створіть експеримент із завантаженим CSV, виберіть `cloud`
(Docker-виконавець бекенду) як дозволену чергу й додайте етап класифікації
в кожен шлях графа. Запустіть обчислення та перевірте статус і журнали бекенду
(`docker compose logs -f backend`, якщо використовуєте Compose). Запуски в черзі `local`
виконує виконавець десктопу, який поки що не передає токен у свій контейнер;
дивіться відповідний пункт в усуненні несправностей нижче.

Після завершення всіх конвеєрів оптимізація використовує локальний образ `aws-jobs-optimization`.
Оптимізатор і контейнери обчислень бекенду читають експеримент і набір даних із
`BACKEND_SERVICE_TOKEN` з `backend/.env`. Задайте для нього будь-який довгий випадковий
рядок і перезапустіть бекенд.

## Усунення несправностей

- **Помилка CORS під час завантаження:** переконайтеся, що бакет має збережене наведене вище
  правило CORS з `AllowedOrigins: ["*"]` і дозволеними `PUT` та `Content-Type`.
- **S3 Access denied:** перевірте регіон бакета та дозвіл `s3:PutObject` в облікових даних
  бекенду. CORS не надає доступу IAM.
- **Docker недоступний або немає дозволу:** запустіть Docker, перевірте інтеграцію з WSL
  чи права користувача Linux і переконайтеся, що `docker info` працює без `sudo`.
- **Запуски залишаються в черзі:** тримайте десктоп відкритим, приберіть будь-яке
  перевизначення `LOCAL_WORKER_ENABLED=false` і виберіть чергу `local`.
- **Запуск завершується помилкою `Not authenticated`:** для запусків, які виконує Docker-виконавець
  бекенду (черга `cloud`), перевірте, що `BACKEND_SERVICE_TOKEN` задано в `backend/.env`,
  і перезапустіть бекенд. Виконавець десктопу для черги `local` запускає свій
  контейнер без токена, тож такі запуски все ще можуть завершуватися цією помилкою (відстежується
  окремо); тим часом використовуйте чергу `cloud`.
- **Оптимізація завершується помилкою `Not authenticated`:** задайте `BACKEND_SERVICE_TOKEN` і
  перезапустіть бекенд.
- **Контейнер не бачить бекенд:** перевірте, що бекенд слухає порт 4000, а
  `BACKEND_GRAPHQL_URL` використовує `host.docker.internal`.
- **Порт 4000 уже зайнятий:** зупиніть наявний сервер, перш ніж запускати інший.
- **Немає вікна десктопу в WSL:** переконайтеся, що доступні WSL 2 і WSLg, за
  [посібником WSL з графічних застосунків](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps).
- **Electron повідомляє про відсутню спільну бібліотеку:** встановіть відповідний пакет
  часу виконання Linux. Ubuntu 24.04 зазвичай потребує `libnss3`, `libgtk-3-0t64`,
  `libgbm1` і `libasound2t64`; Ubuntu 22.04 для пакетів GTK та аудіо використовує `libgtk-3-0` і `libasound2`.
