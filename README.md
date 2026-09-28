# ASCEND / S7 — Optical Archive

Персональный био-сайт: WebGL-линза из семи стеклянных ламелей, которая перестраивается при скролле, камера интерактивных 3D-работ с выгрузкой `.glb`, живой GLSL-стенд и изолированные three.js-опыты, которые можно скачать одним файлом.

## Запуск

Нужен Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка типов + сборка в dist/
npm run preview    # локальный просмотр собранного dist/
```

`dist/` — полностью статичный (`base: './'`), его можно выложить на GitHub Pages, Netlify, Vercel или любой хостинг файлов.

Параметр `?tier=0|1|2` принудительно включает уровень графики (0 — без WebGL, CSS-фолбэк; 2 — полное качество).

## Где что менять

| Что | Файл |
| --- | --- |
| Контакты (Discord, Telegram, TikTok) | `src/content.ts`, разметка раскрытий — `index.html` (`#contact`) |
| Тексты секций | `index.html` |
| 3D-работы в камере образцов | разметка — `index.html` (`[data-specimen-card]`), модели — `src/scene/specimen-models.ts`, описания и имена `.glb` — `src/content.ts` |
| Шейдеры стенда | `src/lab/presets/*.ts` (формат Shadertoy `mainImage`) |
| Скачиваемые опыты | `public/lab/*.html` + список в `src/lab/experiments.ts` |
| Цвета, шрифты, отступы, тайминги | `src/styles/tokens.css` |

Кнопка «Скачать .glb» экспортирует модель прямо из сцены через `GLTFExporter`, поэтому отдельные файлы моделей хранить не нужно. Опыты в `public/lab/` — самодостаточные HTML-файлы (three.js подключается через import map с jsDelivr): их можно открыть локально двойным кликом или отредактировать и вернуть на сайт.

Устройство модулей и контракты между ними описаны в `docs/ARCHITECTURE.md`.
