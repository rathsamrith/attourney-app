import { useEffect, useState } from 'react'
import { describeError, fetchFileUrl } from '@/api/client'
import { Skeleton } from '@/components/ui/skeleton'
import { BlockedState } from './blocked-state'

/** Shows an exhibit PDF. The file is fetched with the access token, then shown from a blob URL. */
export function ExhibitViewer({ exhibitId, title }: { exhibitId: string; title: string }) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let revoked = false
    let objectUrl: string | undefined
    setUrl(undefined)
    setError(undefined)
    fetchFileUrl(`/api/exhibits/${exhibitId}/file`)
      .then((u) => {
        objectUrl = u
        if (!revoked) setUrl(u)
      })
      .catch(setError)
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [exhibitId])

  if (error !== undefined) return <BlockedState reason={describeError(error)} />
  if (!url) return <Skeleton className="h-[60vh] w-full" />
  return <iframe src={url} title={title} className="h-[60vh] w-full rounded-md border bg-white" />
}
