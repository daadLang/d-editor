import { Palette } from "lucide-react"

import { Shortcut } from "@/components/ide/shortcut"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useCommandStore } from "@/core/commands"
import { keybindingLabels } from "@/core/keybindings"
import { THEMES } from "@/lib/themes"
import { setPaletteOpen, updateSettings, useIdeStore } from "@/store/ide"

export function CommandPalette() {
  const open = useIdeStore((state) => state.paletteOpen)
  // Some commands appear only in certain states (`when`), which may depend on
  // the open folder, so the list is re-evaluated when it changes.
  useIdeStore((state) => state.folder)
  const commands = useCommandStore((state) => state.commands)

  const actions = commands.filter(
    (command) => command.title && (!command.when || command.when())
  )

  // Run after the dialog has closed so focus returns to the right place.
  const choose = (run: () => void) => {
    setPaletteOpen(false)
    setTimeout(run, 0)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setPaletteOpen}
      title="لوحة الأوامر"
      description="ابحث عن أمر لتنفيذه"
    >
      <CommandInput placeholder="اكتب اسم أمر أو مظهر…" />
      <CommandList>
        <CommandEmpty>لا توجد نتائج.</CommandEmpty>
        <CommandGroup heading="الأوامر">
          {actions.map(({ id, title, icon: Icon, keybinding, run }) => (
            <CommandItem
              key={id}
              value={title}
              onSelect={() => choose(() => void run())}
            >
              {Icon && <Icon />}
              {title}
              {keybinding && (
                <span className="ms-auto">
                  <Shortcut keys={keybindingLabels(keybinding)} />
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="تغيير المظهر">
          <CommandItem
            value="مظهر افتراضي ضاد"
            onSelect={() => choose(() => void updateSettings({ theme: "" }))}
          >
            <Palette />
            افتراضي (ضاد، يتبع نمط النظام)
          </CommandItem>
          {THEMES.map((theme) => (
            <CommandItem
              key={theme.key}
              value={`مظهر ${theme.label}`}
              onSelect={() => choose(() => void updateSettings({ theme: theme.key }))}
            >
              <Palette />
              <span dir="ltr">{theme.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
