// Commons 圖片署名（CC BY 系列依法必須署名，credit 塊不可拿掉）
interface CreditImg { title: string; author: string; license: string; licenseUrl: string; sourceUrl: string }
export function Credit({ img, inline = false }: { img: CreditImg; inline?: boolean }) {
  const body = (
    <>
      「{img.title}」 {img.author}｜<a href={img.licenseUrl} target="_blank" rel="noopener noreferrer">{img.license}</a>｜<a href={img.sourceUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons ↗</a>
    </>
  )
  return inline ? <span className="credit" style={{ marginTop: 0 }}>{body}</span> : <div className="credit">{body}</div>
}
