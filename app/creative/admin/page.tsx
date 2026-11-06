import { redirect } from 'next/navigation'
import { centerBase } from '@/app/creative/_lib/base'

export default async function Index() {
  redirect(`${await centerBase()}/admin/analysis`)
}
