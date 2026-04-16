import { type KeyboardEvent, useRef, useEffect } from 'react'
import { Plus, ArrowUp } from 'lucide-react'

interface ChatInputProps {
    input: string
    sending: boolean
    canSend: boolean
    onInputChange: (value: string) => void
    onSend: () => void
    onFocus?: () => void
    onBlur?: () => void
}

export function ChatInput({
    input,
    sending,
    canSend,
    onInputChange,
    onSend,
    onFocus,
    onBlur,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [input])

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
        }
    }

    const isDisabled = sending || !input.trim() || !canSend

    return (
        <div style={styles.wrapper}>
            <div style={styles.container}>
                <div style={styles.inputContainer}>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => onInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder="What can I help you with?"
                        disabled={sending}
                        style={styles.textarea}
                        rows={1}
                    />

                </div>
                <div style={styles.buttonContainer}>
                    <button type="button" title="Attach file" style={styles.attachButton}>
                        <Plus size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={isDisabled}
                        title="Send message"
                        style={{
                            ...styles.sendButton,
                            cursor: sending ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.5 : 1,
                        }}
                    >
                        <ArrowUp style={styles.sendButtonIcon} />
                    </button>
                </div>
            </div>
        </div>
    )
}

const styles = {
    wrapper: {
        padding: 'var(--nous-space-sm)',
        paddingTop: '0px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-sm)',
    },
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start',
        width: '100%',
        background: 'var(--nous-bg-surface)',
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid var(--nous-border)',
    },
    inputContainer: {
        flex: 1,
        width: '100%',
        padding: 'var(--nous-space-lg) var(--nous-space-xl)',
        borderBottom: '1px solid var(--nous-border)',
    },
    buttonContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: 'var(--nous-space-md) var(--nous-space-xl)',
    },
    textarea: {
        flex: 1,
        width: '100%',
        resize: 'none' as const,
        background: 'transparent',
        border: 'none',
        color: 'var(--nous-fg)',
        outline: 'none',
        lineHeight: '1.5',
        maxHeight: '300px',
        overflowY: 'auto' as const,
        fontFamily: 'inherit',
        fontSize: 'var(--nous-font-size-sm)',
        padding: 0,
    },
    attachButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        height: 20,
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--nous-radius-md)',
        color: 'var(--nous-fg-muted)',
        cursor: 'pointer',
    },
    sendButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        flexShrink: 0,
        background: 'var(--nous-btn-primary-bg)',
        border: 'none',
        borderRadius: 'var(--nous-radius-full)',
        color: 'var(--nous-fg-on-color)',
    },
    sendButtonIcon: {
        width: 16,
        height: 16,
    },
} as const
