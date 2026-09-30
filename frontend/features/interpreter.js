import { byId, setBusy, showNotice } from '../ui/dom.js';

export function createInterpreterController({ api, getSettings, onSettingsChanged }) {
  const select = byId('interpreterSelect');
  const pathInput = byId('interpreterPathInput');
  const status = byId('interpreterStatus');
  const version = byId('interpreterVersion');
  const release = byId('interpreterRelease');
  const selectButton = byId('selectInterpreterBtn');
  const installButton = byId('installInterpreterBtn');
  const refreshButton = byId('refreshInterpreterBtn');
  let options = [];
  let selectedOption = null;

  function renderCatalog(nextOptions = []) {
    options = nextOptions;
    select.replaceChildren();
    if (options.length === 0) {
      select.add(new Option('لم يتم العثور على مفسرات متوافقة', ''));
      selectedOption = null;
      renderStatus();
      return;
    }

    for (const option of options) {
      const label = option.installed
        ? `${option.label} · مثبت`
        : `${option.label} · متاح للتنزيل`;
      select.add(new Option(label, option.id));
    }
    const configured = getSettings().interpreterPath;
    selectedOption = options.find(option => option.path === configured)
      || options.find(option => option.selected)
      || options[0];
    select.value = selectedOption?.id || '';
    renderStatus();
  }

  function renderStatus() {
    const settings = getSettings();
    const activePath = settings.interpreterPath || '';
    const activeOption = options.find(option => option.path === activePath);
    if (pathInput) pathInput.value = activePath;
    if (version) version.textContent = activeOption?.version || 'غير معروف';
    if (release) {
      const releaseOption = selectedOption?.releaseTag ? selectedOption : options.find(option => option.releaseTag);
      release.textContent = releaseOption?.releaseTag
        ? `الإصدار المقترح: ${releaseOption.releaseTag}`
        : 'لا توجد إصدارات متاحة لهذا النظام';
      release.disabled = !releaseOption?.releaseUrl;
      release.onclick = () => releaseOption?.releaseUrl && api.openExternalUrl(releaseOption.releaseUrl);
    }
    if (status) {
      status.textContent = activePath
        ? `المفسر الحالي: ${activePath}`
        : selectedOption?.releaseTag
          ? `الإصدار ${selectedOption.releaseTag} جاهز للتثبيت.`
          : 'لم يتم اختيار مفسر.';
      status.dataset.state = activePath ? 'ready' : 'missing';
    }
  }

  async function refresh() {
    try {
      renderCatalog(await api.listInterpreters(getSettings().interpreterPath || ''));
    } catch (error) {
      renderCatalog([]);
      showNotice(`تعذر تحميل قائمة المفسرات: ${error.message}`, 'error');
    }
  }

  async function chooseOption() {
    selectedOption = options.find(option => option.id === select.value) || null;
    if (selectedOption?.path) {
      getSettings().interpreterPath = selectedOption.path;
      onSettingsChanged();
      renderStatus();
      showNotice('تم اختيار المفسر', 'success');
    } else {
      renderStatus();
    }
  }

  async function selectFile() {
    try {
      const selectedPath = await api.selectInterpreter();
      if (!selectedPath) return;
      getSettings().interpreterPath = selectedPath;
      onSettingsChanged();
      await refresh();
      showNotice('تم اختيار المفسر', 'success');
    } catch (error) {
      showNotice(`تعذر اختيار المفسر: ${error.message}`, 'error');
    }
  }

  async function install() {
    if (!selectedOption?.releaseTag) {
      showNotice('اختر إصدارًا متاحًا للتنزيل أولًا', 'error');
      return;
    }
    setBusy(installButton, true, 'جارٍ التثبيت...');
    try {
      const installedPath = await api.installInterpreter(selectedOption.releaseTag);
      getSettings().interpreterPath = installedPath;
      onSettingsChanged();
      await refresh();
      showNotice('تم تثبيت المفسر وتعيينه كمفسر حالي', 'success');
    } catch (error) {
      showNotice(`تعذر تثبيت المفسر: ${error.message}`, 'error');
    } finally {
      setBusy(installButton, false, 'تثبيت المحدد');
    }
  }

  select?.addEventListener('change', chooseOption);
  selectButton?.addEventListener('click', selectFile);
  installButton?.addEventListener('click', install);
  refreshButton?.addEventListener('click', refresh);

  return { refresh, renderCatalog };
}
