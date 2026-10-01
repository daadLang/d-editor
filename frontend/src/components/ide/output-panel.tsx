import { useEffect, useRef, useState } from "react"
import { CircleStop, Eraser, Send, TerminalSquare, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  clearOutput,
  endStdin,
  sendStdin,
  setOutputOpen,
  useIdeStore,
  type OutputKind,
} from "@/store/ide"

const KIND_STYLE: Record<OutputKind, string> = {
  stdout: "text-foreground",
  stderr: "text-destructive",
  stdin: "text-primary",
  info: "text-muted-foreground",
}

export function OutputPanel() {
  const { running, exitCode, segments } = useIdeStore((state) => state.output)
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [segments])

  const submit = () => {
    if (!running || input === "") return
    void sendStdin(input)
    setInput("")
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b ps-3 pe-1.5">
        <TerminalSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">نافذة الإخراج</span>
        {running && (
          <Badge variant="secondary" className="gap-1.5">
            <Spinner className="size-3" />
            قيد التشغيل
          </Badge>
        )}
        {!running && exitCode !== null && (
          <Badge variant={exitCode === 0 ? "secondary" : "destructive"}>
            رمز الخروج: <span dir="ltr">{exitCode}</span>
          </Badge>
        )}
        <div className="ms-auto flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            title="مسح"
            aria-label="مسح"
            onClick={clearOutput}
          >
            <Eraser />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="إغلاق"
            aria-label="إغلاق"
            onClick={() => setOutputOpen(false)}
          >
            <X />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <pre className="bidi-plaintext p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {segments.map((segment) => (
            <span key={segment.id} className={cn(KIND_STYLE[segment.kind])}>
              {segment.kind === "stdin" ? `› ${segment.text}` : segment.text}
            </span>
          ))}
          <div ref={endRef} />
        </pre>
      </ScrollArea>

      <div className="shrink-0 border-t p-2">
        <InputGroup>
          <InputGroupInput
            value={input}
            disabled={!running}
            placeholder={
              running ? "أدخل نصًا للإرسال إلى stdin…" : "ابدأ التشغيل لإدخال نص"
            }
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              disabled={!running}
              title="إنهاء الإدخال (EOF)"
              onClick={() => void endStdin()}
            >
              <CircleStop />
              EOF
            </InputGroupButton>
            <InputGroupButton
              variant="default"
              disabled={!running || input === ""}
              onClick={submit}
            >
              <Send className="rtl:-scale-x-100" />
              إرسال
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}
