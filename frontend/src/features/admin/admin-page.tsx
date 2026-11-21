import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { AdminUserDto, ScheduleSessionDto } from '@/api/generated'
import {
  useAdminCases,
  useAdminUsers,
  useCreateCase,
  useCreateUser,
  useUpdateUser,
} from '@/api/queries'
import { PageHeader } from '@/app/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const ROLES = ['adj', 'counsel', 'officer', 'witness', 'admin'] as const
const SIDES = ['P', 'D', 'T'] as const
const FORUMS = ['deposition', 'arbitration', 'regulatory'] as const
const SESSION_ROLES = ['presiding', 'panelist', 'counsel', 'witness', 'officer', 'reporter'] as const
type Role = (typeof ROLES)[number]
type Side = (typeof SIDES)[number]

const DEFAULT_SR: Record<string, string> = { adj: 'panelist', counsel: 'counsel', officer: 'officer', witness: 'witness' }

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function AdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'users' | 'cases'>('users')

  return (
    <>
      <PageHeader title={t('admin.title')} description={t('admin.description')} />
      <div className="mb-4 inline-flex rounded-md border p-0.5">
        {(['users', 'cases'] as const).map((k) => (
          <Button key={k} variant={tab === k ? 'default' : 'ghost'} size="sm" onClick={() => setTab(k)}>
            {t(`admin.tab${k === 'users' ? 'Users' : 'Cases'}`)}
          </Button>
        ))}
      </div>
      {tab === 'users' ? <UsersPanel /> : <CasesPanel />}
    </>
  )
}

// ---------------- Users ----------------

interface UserForm {
  id?: string
  name: string
  email: string
  role: Role
  side: Side
}
const EMPTY_USER: UserForm = { name: '', email: '', role: 'counsel', side: 'P' }

function UsersPanel() {
  const { t } = useTranslation()
  const users = useAdminUsers()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<UserForm>(EMPTY_USER)
  const editing = form.id !== undefined
  const busy = create.isPending || update.isPending

  const submit = () => {
    const done = (msg: string) => () => {
      toast.success(t(msg))
      setOpen(false)
    }
    const fail = (e: unknown) => toast.error(describeError(e))
    if (editing) {
      update.mutate(
        { id: form.id!, body: { name: form.name, role: form.role, side: form.side } },
        { onSuccess: done('admin.savedToast'), onError: fail },
      )
    } else {
      create.mutate(
        { name: form.name, email: form.email, role: form.role, side: form.side },
        { onSuccess: done('admin.createdToast'), onError: fail },
      )
    }
  }

  const toggleActive = (u: AdminUserDto) =>
    update.mutate({ id: u.id, body: { active: !u.active } }, { onError: (e) => toast.error(describeError(e)) })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.data ? t('admin.userCount', { count: users.data.length }) : ''}</p>
        <Button
          onClick={() => {
            setForm(EMPTY_USER)
            setOpen(true)
          }}
        >
          {t('admin.addUser')}
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.colName')}</TableHead>
              <TableHead>{t('admin.colEmail')}</TableHead>
              <TableHead>{t('admin.colRole')}</TableHead>
              <TableHead>{t('admin.colSide')}</TableHead>
              <TableHead>{t('admin.colStatus')}</TableHead>
              <TableHead className="text-right">{t('admin.colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            )}
            {users.data?.map((u) => (
              <TableRow key={u.id} className={u.active ? undefined : 'opacity-60'}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`roles.${u.role}`)}</Badge>
                </TableCell>
                <TableCell>{t(`sides.${u.side}`)}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? 'secondary' : 'outline'}>{u.active ? t('admin.active') : t('admin.inactive')}</Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setForm({ id: u.id, name: u.name, email: u.email, role: u.role as Role, side: u.side as Side })
                      setOpen(true)
                    }}
                  >
                    {t('admin.edit')}
                  </Button>
                  <Button
                    variant={u.active ? 'ghost' : 'outline'}
                    size="sm"
                    className={u.active ? 'text-destructive' : undefined}
                    disabled={busy}
                    onClick={() => toggleActive(u)}
                  >
                    {u.active ? t('admin.deactivate') : t('admin.reactivate')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? t('admin.editTitle') : t('admin.createTitle')}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            <Field label={t('admin.colName')}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('admin.colEmail')}>
              <Input type="email" value={form.email} disabled={editing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('admin.colRole')}>
              <select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('admin.colSide')}>
              <select className={selectClass} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as Side })}>
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sides.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SheetFooter>
            <Button onClick={submit} disabled={busy || !form.name || (!editing && !form.email)}>
              {t('admin.save')}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t('admin.cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ---------------- Cases ----------------

function localNow(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CasesPanel() {
  const { t } = useTranslation()
  const cases = useAdminCases()
  const users = useAdminUsers()
  const create = useCreateCase()
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [docketNo, setDocketNo] = useState('')
  const [forum, setForum] = useState<(typeof FORUMS)[number]>('arbitration')
  const [startsAt, setStartsAt] = useState(localNow)
  const [parts, setParts] = useState<Record<string, string>>({})

  const openCreate = () => {
    setCaption('')
    setDocketNo('')
    setForum('arbitration')
    setStartsAt(localNow())
    setParts({})
    setOpen(true)
  }

  const submit = () => {
    const participants = Object.entries(parts).map(([userId, sessionRole]) => ({ userId, sessionRole })) as ScheduleSessionDto['participants']
    create.mutate(
      { matter: { caption, docketNo, forum }, startsAt: new Date(startsAt).toISOString(), participants },
      {
        onSuccess: () => {
          toast.success(t('admin.caseCreatedToast'))
          setOpen(false)
        },
        onError: (e) => toast.error(describeError(e)),
      },
    )
  }

  const selectable = (users.data ?? []).filter((u) => u.active && u.role !== 'admin')

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cases.data ? t('admin.caseCount', { count: cases.data.length }) : ''}</p>
        <Button onClick={openCreate}>{t('admin.addCase')}</Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.colCase')}</TableHead>
              <TableHead>{t('admin.colDocket')}</TableHead>
              <TableHead>{t('admin.colForum')}</TableHead>
              <TableHead>{t('admin.colSessions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.isPending && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            )}
            {cases.data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.caption}</TableCell>
                <TableCell className="font-mono text-xs">{c.docketNo}</TableCell>
                <TableCell>{t(`admin.forums.${c.forum}`)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.sessions.length} · {c.sessions.reduce((n, s) => n + s.participants, 0)} {t('admin.participants').toLowerCase()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('admin.createCaseTitle')}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            <Field label={t('admin.caseCaption')}>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Doe v. Roe" />
            </Field>
            <Field label={t('admin.docketNo')}>
              <Input value={docketNo} onChange={(e) => setDocketNo(e.target.value)} placeholder="ARB-2026-0001" />
            </Field>
            <Field label={t('admin.forum')}>
              <select className={selectClass} value={forum} onChange={(e) => setForum(e.target.value as (typeof FORUMS)[number])}>
                {FORUMS.map((f) => (
                  <option key={f} value={f}>
                    {t(`admin.forums.${f}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('admin.startsAt')}>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t('admin.participants')}</span>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {selectable.map((u) => {
                  const picked = u.id in parts
                  return (
                    <div key={u.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={(e) => {
                          setParts((p) => {
                            const next = { ...p }
                            if (e.target.checked) next[u.id] = DEFAULT_SR[u.role] ?? 'witness'
                            else delete next[u.id]
                            return next
                          })
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                      {picked && (
                        <select
                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                          value={parts[u.id]}
                          onChange={(e) => setParts((p) => ({ ...p, [u.id]: e.target.value }))}
                        >
                          {SESSION_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`sessionRoles.${r}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={submit} disabled={create.isPending || !caption || !docketNo || !startsAt}>
              {t('admin.save')}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              {t('admin.cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
