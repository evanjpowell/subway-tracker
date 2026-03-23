import { useState, useEffect, useCallback, useRef } from 'react'
import './Toast.css'

/**
 * Toast notification component.
 *
 * Usage: the parent calls `show(message)` via the ref-like pattern —
 * but since we want this to be simple, we expose a custom hook instead.
 *
 * Pattern:
 *   const { toastMsg, toastVisible, showToast } = useToast()
 *   <Toast message={toastMsg} visible={toastVisible} />
 */

export function useToast(duration = 2200) {
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const timerRef = useRef(null)

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setToastVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToastVisible(false), duration)
  }, [duration])

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { toastMsg, toastVisible, showToast }
}

export default function Toast({ message, visible }) {
  return (
    <div className={`toast ${visible ? 'show' : ''}`}>
      {message}
    </div>
  )
}
