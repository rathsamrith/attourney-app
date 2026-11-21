import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { AdminUserDto } from '@/api/generated'
import { useAdminUsers, useCreateUser, useUpdateUser } from '@/api/queries'
import { PageHeader } from '@/app/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const ROLES = ['adj', 'counsel', 'officer', 'witness'] as const
const SIDES = ['P', 'D', 'T'] as const
type Role = (typeof ROLES)[number]
type Side = (typeof SIDES)[number]

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

interface Form {
  id?: string
  name: string
  email: string
  role: Role
  side: Side
}
const EMPTY: Form = { name: '', email: '', role: 'counsel', side: 'P' }

export function AdminPage() {
  const { t } = useTranslation()
  const users = useAdminUsers()
  const create = useCreateUser()
  const update = useUpdateUser()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(EMPTY)
  const editing = form.id !== undefined
  const busy = create.isPending || update.isPending

  const openCreate = () => {
    setForm(EMPTY)
    setOpen(true)
  }
  const openEdit = (u: AdminUserDto) => {
    setForm({ id: u.id, name: u.name, email: u.email, role: u.role as Role, side: u.side as Side })
    setOpen(true)
  }

  const submit = () => {
    if (editing) {
      update.mutate(
        { id: form.id!, body: { name: form.name, role: form.role, side: form.side } },
        {
          onSuccess: () => {
            toast.success(t('admin.savedToast'))
            setOpen(false)
          },
          onError: (e) => toast.error(describeError(e)),
        },
      )
    } else {
      create.mutate(
        { name: form.name, email: form.email, role: form.role, side: form.side },
        {
          onSuccess: () => {
            toast.success(t('admin.createdToast'))
            setOpen(false)
          },
          onError: (e) => toast.error(describeError(e)),
        },
      )
    }
  }

  const toggleActive = (u: AdminUserDto) =>
    update.mutate(
      { id: u.id, body: { active: !u.active } },
      { onError: (e) => toast.error(describeError(e)) },
    )

  return (
    <>
      <PageHeader title={t('admin.title')} description={t('admin.description')} />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.data ? t('admin.userCount', { count: users.data.length }) : ''}
        </p>
        <Button onClick={openCreate}>{t('admin.addUser')}</Button>
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
            {users.isPending &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {users.data?.map((u) => (
              <TableRow key={u.id} className={u.active ? undefined : 'opacity-60'}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`roles.${u.role}`)}</Badge>
                </TableCell>
                <TableCell>{t(`sides.${u.side}`)}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? 'secondary' : 'outline'}>
                    {u.active ? t('admin.active') : t('admin.inactive')}
                  </Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)} disabled={busy}>
                    {t('admin.edit')}
                  </Button>
                  <Button
                    variant={u.active ? 'ghost' : 'outline'}
                    size="sm"
                    className={u.active ? 'text-destructive' : undefined}
                    onClick={() => toggleActive(u)}
                    disabled={busy}
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
            <label className="grid gap-1.5 text-sm font-medium">
              {t('admin.colName')}
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('admin.colEmail')}
              <Input
                type="email"
                value={form.email}
                disabled={editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('admin.colRole')}
              <select
                className={selectClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('admin.colSide')}
              <select
                className={selectClass}
                value={form.side}
                onChange={(e) => setForm({ ...form, side: e.target.value as Side })}
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sides.${s}`)}
                  </option>
                ))}
              </select>
            </label>
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
