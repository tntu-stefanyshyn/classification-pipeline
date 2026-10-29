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
