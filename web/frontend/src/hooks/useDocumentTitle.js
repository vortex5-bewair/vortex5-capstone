import { useEffect } from 'react'

// Sets the browser tab title to "BewAir · <label>", or plain "BewAir" when
// label is falsy (still-loading data, or a page with no per-route label).
// Passing `undefined` skips the effect entirely — used by routes that don't
// own the title themselves (e.g. /device/:id, where DeviceDetail sets it
// once the device's actual name has loaded).
export function useDocumentTitle(label) {
  useEffect(() => {
    if (label === undefined) return
    document.title = label ? `BewAir · ${label}` : 'BewAir'
  }, [label])
}
