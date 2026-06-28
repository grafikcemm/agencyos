export const dynamic = 'force-dynamic'

import { AkademiClient } from '@/components/akademi/AkademiClient'
import { getAkademiData } from '@/app/actions/academyActions'

export default async function AkademiPage() {
  const { courses, exams } = await getAkademiData()
  return (
    <div className="pt-8">
      <AkademiClient courses={courses} exams={exams} />
    </div>
  )
}
