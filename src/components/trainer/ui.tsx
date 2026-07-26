import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import {
 type HintActionOptions,
 useHintAction,
} from '../../context/HintActionContext'

type PanelCardProps = {
 children: ReactNode
 style?: React.CSSProperties
}

export function PanelCard({ children, style }: PanelCardProps) {
 return (
 <div
 style={{
 background: 'var(--theme-panel-2)',
 border: '1px solid var(--theme-border)',
 borderRadius: 12,
 padding: 12,
 boxShadow: '0 7px 18px rgba(0,0,0,0.16)',
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
 className,
 style,
 ...props
}: ButtonBaseProps) {
 return (
 <button
 {...props}
 className={className}
 disabled={disabled}
 style={{
 flex: fullWidth ? 1 : undefined,
 background: disabled ? 'color-mix(in srgb, var(--theme-accent) 48%, var(--theme-panel-input))' : 'linear-gradient(180deg,var(--theme-accent-strong),var(--theme-accent))',
 color: 'var(--theme-accent-text)',
 border: '1px solid color-mix(in srgb, var(--theme-accent-strong) 45%, transparent)',
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
 border: '1px solid var(--theme-border)',
 borderRadius: 10,
 padding: '12px 14px',
 background: disabled ? 'var(--theme-panel-input)' : 'var(--theme-button-bg)',
 color: disabled ? 'var(--theme-muted)' : 'var(--theme-text)',
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

type HintButtonProps = ButtonBaseProps & {
 getHintMove: HintActionOptions['getHintMove']
 onHintStage?: HintActionOptions['onHintStage']
 onHintReset?: HintActionOptions['onHintReset']
 hintResetKey?: unknown
}

export function HintButton({
 children,
 disabled,
 fullWidth = true,
 getHintMove,
 onHintStage,
 onHintReset,
 hintResetKey,
 className,
 style,
 onClick: _onClick,
 ...props
}: HintButtonProps) {
 const { triggerHint } = useHintAction({
 getHintMove,
 onHintStage,
 onHintReset,
 disabled: Boolean(disabled),
 resetKey: hintResetKey,
 })

 return (
 <button
 {...props}
 className={[className, 'site-inline-hint'].filter(Boolean).join(' ')}
 disabled={disabled}
 onClick={() => void triggerHint()}
 style={{
 flex: fullWidth ? 1 : undefined,
 background: disabled ? 'var(--theme-panel-input)' : 'var(--theme-warning-bg)',
 color: disabled ? 'var(--theme-muted)' : 'var(--theme-warning-text)',
 border: '1px solid var(--theme-border)',
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
 background: 'var(--theme-panel-input)',
 borderRadius: 999,
 overflow: 'hidden',
 ...style,
 }}
 >
 <div
 style={{
 width: `${clamped}%`,
 height: '100%',
 background: 'var(--theme-accent)',
 transition: 'width 0.25s ease',
 }}
 />
 </div>
 )
}

export function SectionTitle({ children }: { children: ReactNode }) {
 return (
 <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--theme-text)' }}>{children}</div>
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
 color: 'var(--theme-highlight)',
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
 border: '1px solid var(--theme-input-border)',
 background: 'var(--theme-panel-input)',
 color: 'var(--theme-text)',
 padding: '10px',
 fontSize: 14,
 outline: 'none',
 ...style,
 }}
 />
 )
}
