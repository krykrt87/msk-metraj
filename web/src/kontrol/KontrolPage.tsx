import { doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { can } from '@shared/access';
import { FINDING_STATUS_LABEL, type FindingStatus, type UserProfile } from '@shared/types';
import { BASE, useFindings } from '../data/hooks';
import { db } from '../firebase';
import { LOCAL, LOCAL_READONLY } from '../local';

const STATUSES = Object.keys(FINDING_STATUS_LABEL) as FindingStatus[];

// Kurallar (firestore.rules) düzenleyiciye bulgu güncellemeyi doğrudan izin veriyor; sunucu fonksiyonu gerekmez.
async function setStatus(id: string, status: FindingStatus) {
  if (LOCAL) throw new Error(LOCAL_READONLY);
  await updateDoc(doc(db, `${BASE}/findings/${id}`), { status });
}

export function KontrolPage({ profile }: { profile: UserProfile }) {
  const findings = useFindings();
  const [status, setFilter] = useState<FindingStatus | ''>('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editable = can(profile, 'edit');

  const topics = useMemo(() => [...new Set(findings.data.map((f) => f.topic))], [findings.data]);
  const shown = findings.data.filter((f) => (!status || f.status === status) && (!topic || f.topic === topic));
  const countOf = (s: FindingStatus) => findings.data.filter((f) => f.status === s).length;

  const change = (id: string, s: FindingStatus) => {
    setError(null);
    setStatus(id, s).catch((e: Error) => setError(e.message || 'Kaydedilemedi.'));
  };

  if (findings.error) return <p className="center-note">Veri okunamadı: {findings.error.message}</p>;
  if (findings.loading) return <p className="center-note">Yükleniyor…</p>;
  return (
    <section className="malzeme">
      <header className="malzeme-head">
        <h1>Proje Kontrol</h1>
        <dl className="malzeme-stats">
          {STATUSES.map((s) => (
            <div key={s} className={s === 'acik' && countOf(s) ? 'warn' : undefined}>
              <dt>{FINDING_STATUS_LABEL[s]}</dt>
              <dd>{countOf(s)}</dd>
            </div>
          ))}
        </dl>
      </header>
      <div className="malzeme-filters">
        <select aria-label="Durum" value={status} onChange={(e) => setFilter(e.target.value as FindingStatus | '')}>
          <option value="">Tüm durumlar</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {FINDING_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select aria-label="Konu" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Tüm konular</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="count">
          {shown.length} / {findings.data.length}
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <table className="data malzeme-table">
        <thead>
          <tr>
            <th className="num">No</th>
            <th>Konu</th>
            <th>Pafta</th>
            <th>Bulgu</th>
            <th>Öneri</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((f) => (
            <tr key={f.id}>
              <td className="num">{f.no}</td>
              <td>{f.topic}</td>
              <td className="mono">{f.drawingsText}</td>
              <td>{f.finding}</td>
              <td>{f.suggestion}</td>
              <td>
                {editable ? (
                  <select aria-label={`Bulgu ${f.no} durumu`} value={f.status} onChange={(e) => change(f.id, e.target.value as FindingStatus)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FINDING_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  FINDING_STATUS_LABEL[f.status]
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="hint pad">Süzgece uyan bulgu yok.</p>}
    </section>
  );
}
