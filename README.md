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
سطح مكتب. بنية المشروع هي بنية قالب Wails 3 القياسي (`wails3 init -t react`)،
لذلك تعمل معه أوامر `wails3` مباشرة، وتوجد أيضًا اختصارات في [Makefile](Makefile).

**المتطلبات:** Go 1.25 وNode.js وYarn وmake. وعلى لينكس تحتاج أيضًا إلى حزم النظام
(الواجهة الافتراضية في Wails 3 beta.28 هي GTK 4):

```bash
sudo apt install build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev
```

```bash
make setup      # تثبيت أداة wails3 وحزم Go وحزم الواجهة
make doctor     # التحقق من بيئة النظام
make dev        # تشغيل التطبيق مع إعادة التحميل التلقائي
make build      # بناء إنتاجي لنظامك الحالي (الناتج في bin/)
make package    # إنشاء حزمة التثبيت (AppImage/deb/rpm أو مثبّت NSIS أو .app)
```

### البناء لكل المنصات

```bash
make build-all                       # ويندوز (amd64, arm64) + لينكس amd64 + ماك (arm64, amd64) في release/
make build-windows                   # منصة واحدة: build-windows / build-linux / build-darwin
make build-linux-arm64               # هدف محدد: build-<os>-<arch>
make build-all PLATFORMS="windows/amd64 linux/amd64"   # قائمة مخصصة
```

- ويندوز يُبنى بـ Go فقط ولا يحتاج Docker.
- `linux/arm64` ليس ضمن `build-all`. الأمر `make build-linux-arm64` يبنيه مباشرة على جهاز arm64، وعلى جهاز x86 يشغّل حاوية Docker بمعمارية arm64 عبر QEMU (بطيء جدًا في المرة الأولى: بناء الصورة نحو 25 دقيقة، ثم تجميع مُحاكى).
- `make build-all` يكمل بقية المنصات إذا فشلت واحدة، ويعرض في النهاية قائمة بما فشل.
- لينكس وماك يحتاجان Docker عند البناء من نظام مختلف؛ تُبنى صورة `wails-cross` تلقائيًا في أول مرة
  (أو يدويًا بـ `make setup-docker`، حجمها نحو 800MB).
- الملفات الناتجة تُسمّى `daad-ide-<os>-<arch>` داخل `release/`.
- حزم التثبيت (`make package`) تُنشأ لنظامك الحالي، وللنظام الآخر استخدم `make package GOOS=windows`
  (يحتاج أدوات تلك المنصة مثل NSIS).

أوامر أخرى مفيدة: `make help` لعرض كل الأوامر، `make check` للتحقق (vet واختبارات Go وأنواع الواجهة)،
`make icons` لتوليد الأيقونات من `build/appicon.png`، `make clean`.

لتطوير الواجهة وحدها في المتصفح (بدون Go، مع بيانات تجريبية):

```bash
make dev-frontend
```

### بنية المشروع

```
.
├── main.go, app.go, interpreter*.go   تطبيق Go وخدماته (تُستدعى من الواجهة بالاسم)
├── Taskfile.yml                       مهام Wails (يقرؤها wails3 build/dev/package)
├── Makefile                           اختصارات التطوير والبناء
├── build/                             ملفات البناء لكل منصة (config.yml, windows/, darwin/, linux/, docker/)
└── frontend/                          مشروع الواجهة (package.json, vite.config.ts)
    └── src
        ├── components/ui     مكوّنات shadcn/ui (مولّدة بدعم RTL، لا تُعدَّل يدويًا)
        ├── components/ide    مكوّنات المحرر (الشريط الجانبي، التبويبات، الإخراج، ...)
        ├── store/ide.ts      حالة التطبيق وإجراءاته (Zustand)
        ├── lib/wails.ts      واجهة مكتوبة الأنواع لدوال Go في app.go (تستدعيها بالاسم عبر @wailsio/runtime)
        ├── lib/themes.ts     الـ 29 مظهرًا (ألوان الواجهة + مظهر CodeMirror)
        └── language          دعم لغة ضاد في CodeMirror (محلل + إكمال تلقائي)
```

معلومات التطبيق (الاسم والمعرّف والإصدار) في [build/config.yml](build/config.yml)؛ بعد تعديلها شغّل
`make update-assets` لتحديث ملفات المنصات.

تُضاف مكوّنات shadcn الجديدة من مجلد `frontend` بالأمر `npx shadcn@latest add <component>`؛
إعداد `"rtl": true` في [components.json](frontend/components.json) يحوّلها إلى RTL تلقائيًا.

توجد عمليات الملفات والحوار وتشغيل أمر `daad` في [app.go](app.go)، بينما
يستخدم المحرر المحوّل [wails.ts](frontend/src/lib/wails.ts).


##  المساهمة

نرحب بمساهماتكم في تطوير هذا المحرر! يمكنكم:

- فتح Issue لاقتراح ميزة جديدة أو الإبلاغ عن خطأ
- عمل Fork للمشروع وإضافة التحسينات
- إرسال Pull Request مع شرح التغييرات

##  الترخيص

هذا المشروع مرخص تحت رخصة apache-2.0 - راجع ملف [LICENSE](LICENSE) للتفاصيل.
