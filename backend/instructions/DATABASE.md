# Правила роботи з Mongoose

- Не використовуй `.exec()` на Mongoose-запитах.
- Використовуй `lean()` без generic-типів (наприклад, без `lean<UploadedFile>()`).
- Коли викликаєш `toObject`, завжди передавай `toObject({ getters: true })`.
