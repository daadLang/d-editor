import { Kbd, KbdGroup } from "@/components/ui/kbd"

/**
 * Renders a key combination. Key names are always Latin, so the group is
 * forced left-to-right even inside the RTL interface.
 */
export function Shortcut({ keys }: { keys: string[] }) {
  return (
    <KbdGroup dir="ltr">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}
