# ض IDE - محرر نصوص لغة ضاد

محرر نصوص  مصمم خصيصاً للبرمجة بلغة **ض (ضاد)**، وهي لغة برمجة عربية مبتكرة. يوفر المحرر بيئة تطوير متكاملة وسهلة الاستخدام مع دعم كامل للكتابة من اليمين إلى اليسار   .


<p align="center">
  <img src="docs/s1.png" width="600">
</p>

<p align="center">
  <img src="docs/s2.png" width="400">
  <img src="docs/s3.png" width="400">
</p>


## التطوير

يعتمد المحرر على [Wails 3](https://v3.wails.io/) لتشغيل واجهة **React + shadcn/ui** داخل تطبيق Go
سطح مكتب. تحتاج إلى Go 1.25 وNode.js وYarn وWails 3 CLI
(على لينكس تحتاج أيضًا إلى `libgtk-3-dev` و`libwebkit2gtk-4.1-dev`):

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.28
go mod tidy
yarn install
wails3 dev        # أو: yarn dev
```

لبناء التطبيق (الناتج في `bin/`):

```bash
wails3 build      # أو: yarn build
```

للتحقق من الاعتماديات وبيئة النظام: `wails3 doctor`.

لتطوير الواجهة وحدها في المتصفح (بدون Go، مع بيانات تجريبية):

```bash
yarn dev:frontend
```

### بنية الواجهة

```
frontend/src
├── components/ui     مكوّنات shadcn/ui (مولّدة بدعم RTL، لا تُعدَّل يدويًا)
├── components/ide    مكوّنات المحرر (الشريط الجانبي، التبويبات، الإخراج، ...)
├── store/ide.ts      حالة التطبيق وإجراءاته (Zustand)
├── lib/wails.ts      واجهة مكتوبة الأنواع لدوال Go في app.go (تستدعيها بالاسم عبر @wailsio/runtime)
├── lib/themes.ts     الـ 29 مظهرًا (ألوان الواجهة + مظهر CodeMirror)
└── language          دعم لغة ضاد في CodeMirror (محلل + إكمال تلقائي)
```

تُضاف مكوّنات shadcn الجديدة بالأمر `npx shadcn@latest add <component>`؛
إعداد `"rtl": true` في [components.json](components.json) يحوّلها إلى RTL تلقائيًا.

توجد عمليات الملفات والحوار وتشغيل أمر `daad` في [app.go](app.go)، بينما
يستخدم المحرر المحوّل [wails.ts](frontend/src/lib/wails.ts).


##  المساهمة

نرحب بمساهماتكم في تطوير هذا المحرر! يمكنكم:

- فتح Issue لاقتراح ميزة جديدة أو الإبلاغ عن خطأ
- عمل Fork للمشروع وإضافة التحسينات
- إرسال Pull Request مع شرح التغييرات

##  الترخيص

هذا المشروع مرخص تحت رخصة apache-2.0 - راجع ملف [LICENSE](LICENSE) للتفاصيل.
