import { FolderOpen, FolderPlus, History, Keyboard, Settings } from "lucide-react"

import { Shortcut } from "@/components/ide/shortcut"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { useLogo } from "@/hooks/use-logo"
import { MOD } from "@/lib/platform"
import { basename } from "@/lib/path"
import {
  openDialog,
  openFolder,
  openSettings,
  setFolder,
  useIdeStore,
} from "@/store/ide"

const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "تشغيل", keys: ["F5"] },
  { label: "حفظ", keys: [MOD, "S"] },
  { label: "إظهار المستكشف", keys: [MOD, "B"] },
  { label: "نافذة الإخراج", keys: [MOD, "`"] },
  { label: "الإعدادات", keys: [MOD, "P"] },
  { label: "لوحة الأوامر", keys: [MOD, "Shift", "P"] },
]

export function WelcomeView() {
  const recents = useIdeStore((state) => state.recents)
  const logo = useLogo()

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-10 p-8">
        <img src={logo} alt="شعار ضاد" className="h-28 object-contain" />

        <div className="grid w-full gap-8 md:grid-cols-3">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">ابدأ</h2>
            <div className="flex flex-col gap-2">
              <Button onClick={() => void openFolder()}>
                <FolderOpen />
                فتح مشروع…
              </Button>
              <Button
                variant="secondary"
                onClick={() => openDialog({ kind: "new-project" })}
              >
                <FolderPlus />
                مشروع جديد…
              </Button>
              <Button variant="ghost" onClick={openSettings}>
                <Settings />
                الإعدادات
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <History className="size-4" />
              مشاريع أخيرة
            </h2>
            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مشاريع سابقة بعد.</p>
            ) : (
              <ItemGroup>
                {recents.map((path) => (
                  <Item
                    key={path}
                    size="sm"
                    asChild
                    className="cursor-pointer hover:bg-accent"
                  >
                    <button type="button" title={path} onClick={() => setFolder(path)}>
                      <ItemMedia variant="icon">
                        <FolderOpen />
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="max-w-full">
                          <span className="filename">{basename(path)}</span>
                        </ItemTitle>
                        <ItemDescription dir="ltr" className="truncate text-start">
                          {path}
                        </ItemDescription>
                      </ItemContent>
                    </button>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Keyboard className="size-4" />
              اختصارات
            </h2>
            <ul className="flex flex-col gap-2.5">
              {SHORTCUTS.map(({ label, keys }) => (
                <li key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <Shortcut keys={keys} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
