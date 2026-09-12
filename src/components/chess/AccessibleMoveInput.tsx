import { useEffect, useId, useRef, useState } from "react"

const SQUARE_PATTERN = /^[a-h][1-8]$/i

export default function AccessibleMoveInput({
  onSquareClick,
  disabled = false,
  orientation,
  resetKey,
  timedMasteryEnabled = true,
}: {
  onSquareClick: (square: string) => void
  disabled?: boolean
  orientation: "white" | "black"
  resetKey: string
  timedMasteryEnabled?: boolean
}) {
  const id = useId()
  const targetRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState("")
  const [target, setTarget] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    setSource("")
    setTarget("")
    setMessage("")
  }, [resetKey])

  function normalize(value: string) {
    return value.trim().toLowerCase()
  }

  function selectSource() {
    const square = normalize(source)
    if (!SQUARE_PATTERN.test(square)) {
      setMessage("Enter a source square from a1 to h8.")
      return
    }
    onSquareClick(square)
    setMessage(`Source ${square} selected. Enter the destination square.`)
    targetRef.current?.focus()
  }

  function selectTarget() {
    const square = normalize(target)
    if (!SQUARE_PATTERN.test(square)) {
      setMessage("Enter a destination square from a1 to h8.")
      return
    }
    onSquareClick(square)
    setSource("")
    setTarget("")
    setMessage(`Destination ${square} submitted.`)
  }

  return (
    <details className="accessible-move-input">
      <summary>Keyboard move controls</summary>
      <p id={`${id}-instructions`}>
        Board orientation: {orientation} at the bottom. Enter and activate the source square first; {timedMasteryEnabled ? "the perfect-solve recognition timer starts at that action" : "recognition time is not used for mastery"}. Then enter the destination. Promotions use the same piece chooser as the board.
      </p>
      <div className="accessible-move-input__fields" aria-describedby={`${id}-instructions`}>
        <label htmlFor={`${id}-source`}>From square</label>
        <input
          id={`${id}-source`}
          value={source}
          disabled={disabled}
          inputMode="text"
          autoComplete="off"
          maxLength={2}
          placeholder="e2"
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectSource() } }}
        />
        <button type="button" disabled={disabled} onClick={selectSource}>Select source</button>
        <label htmlFor={`${id}-target`}>To square</label>
        <input
          ref={targetRef}
          id={`${id}-target`}
          value={target}
          disabled={disabled}
          inputMode="text"
          autoComplete="off"
          maxLength={2}
          placeholder="e4"
          onChange={(event) => setTarget(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectTarget() } }}
        />
        <button type="button" disabled={disabled} onClick={selectTarget}>Make move</button>
      </div>
      <p className="accessible-move-input__status" role="status" aria-live="polite" aria-atomic="true">{message}</p>
    </details>
  )
}
