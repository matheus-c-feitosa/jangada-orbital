import { useEffect, useState } from 'react'
import { Link2, MessageCircle, Share2 } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  /** the link of the view on screen (urlState.viewUrl) */
  url: string
  /** the WhatsApp message: area, answer and link (urlState.shareText) */
  text: string
  /** touch layouts: 48 px buttons, and the system share sheet where the browser has one */
  touch?: boolean
}

/** "Share this view" (T039, #5): copy the link (or the phone's share sheet) and send it on WhatsApp. */
export function SharePanel({ url, text, touch }: Props) {
  const i = useI18n()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setCopied(false); setFailed(false) }, [url])
  const native = touch && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setFailed(false)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      setFailed(true) // no clipboard access: the link shows in a field to copy by hand
    }
  }
  const share = () => {
    navigator.share({ title: 'Jangada Orbital', text, url }).catch(() => { /* closed by the user */ })
  }
  const button = `btn ${touch ? 'touch !min-h-12 !rounded-xl !text-sm' : ''}`

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby="share-title">
      <p className="lbl" id="share-title">{i.t('shareTitle')}</p>
      <div className="grid grid-cols-2 gap-2">
        {native
          ? <button type="button" className={button} onClick={share}><Share2 size={16} aria-hidden="true" /> {i.t('share')}</button>
          : <button type="button" className={button} onClick={copy}><Link2 size={16} aria-hidden="true" /> {i.t('copyLink')}</button>}
        <a className={`${button} no-underline`} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> WhatsApp<span className="sr-only"> {i.t('newTab')}</span>
        </a>
      </div>
      <span role="status" className="min-h-4 text-xs text-ink-3">{copied ? i.t('linkCopied') : ''}</span>
      {failed && (
        <input className="ctl text-xs" readOnly value={url} aria-label={i.t('linkToCopy')} onFocus={(e) => e.currentTarget.select()} />
      )}
    </div>
  )
}
