import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type PanelCardProps = {
  children: ReactNode
  style?: React.CSSProperties
}

export function PanelCard({ children, style }: PanelCardProps) {
  return (
    <div
      style={{
        background: '#2a2523',
        borderRadius: 10,
        padding: 12,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

type ButtonBaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  fullWidth?: boolean
}

export function PrimaryButton({
  children,
  disabled,
  fullWidth = true,
  style,
  ...props
}: ButtonBaseProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        flex: fullWidth ? 1 : undefined,
        background: disabled ? '#5f6f40' : '#88a94f',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '13px 12px',
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.72 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  disabled,
  fullWidth = true,
  style,
  ...props
}: ButtonBaseProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        flex: fullWidth ? 1 : undefined,
        border: 'none',
        borderRadius: 10,
        padding: '12px 14px',
        background: disabled ? '#2e2a28' : '#4c4744',
        color: disabled ? '#8f8a86' : '#f3f3f3',
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function HintButton({
  children,
  disabled,
  fullWidth = true,
  style,
  ...props
}: ButtonBaseProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        flex: fullWidth ? 1 : undefined,
        background: disabled ? '#2e2a28' : '#6d5a2c',
        color: disabled ? '#8f8a86' : '#fff4cf',
        border: 'none',
        borderRadius: 10,
        padding: '13px 12px',
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function ProgressBar({
  percent,
  style,
}: {
  percent: number
  style?: React.CSSProperties
}) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div
      style={{
        height: 10,
        background: '#3a3431',
        borderRadius: 999,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: '#7fa650',
          transition: 'width 0.25s ease',
        }}
      />
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{children}</div>
  )
}

export function BigMessage({
  streak,
  message,
}: {
  streak: ReactNode
  message: ReactNode
}) {
  return (
    <div
      style={{
        marginBottom: 4,
        textAlign: 'center',
        padding: '4px 0 2px',
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#f2c14e',
          marginBottom: 6,
        }}
      >
        {streak}
      </div>

      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{message}</div>
    </div>
  )
}

export function ShellInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    style?: React.CSSProperties
  }
) {
  const { style, ...rest } = props

  return (
    <input
      {...rest}
      style={{
        flex: 1,
        borderRadius: 8,
        border: '1px solid #555',
        background: '#222',
        color: '#fff',
        padding: '10px',
        fontSize: 14,
        outline: 'none',
        ...style,
      }}
    />
  )
}