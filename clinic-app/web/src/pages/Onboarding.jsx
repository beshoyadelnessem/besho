import { useMemo, useState } from 'react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { ErrorBox, Figure, lookOf, useError } from '../components/ui.jsx';

// First visit: gender, age, outfit -> the character used in every exercise.
// Gender and outfit are fixed once saved; age can change later in settings.
export default function Onboarding({ me, onSaved }) {
  const { t } = useI18n();
  const [gender, setGender] = useState(me.gender || '');
  const [age, setAge] = useState(me.birth_year ? String(new Date().getFullYear() - me.birth_year) : '');
  const [hijab, setHijab] = useState(!!me.avatar?.hijab);
  const [error, setError] = useError();
  const [busy, setBusy] = useState(false);

  const ageNum = Number(age);
  const canHijab = gender === 'female' && ageNum >= 14;
  const draft = { gender, birth_year: ageNum ? new Date().getFullYear() - ageNum : null, avatar: canHijab && hijab ? { hijab: true } : {} };
  const look = useMemo(() => lookOf(draft), [gender, age, hijab]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!gender) return setError(t('errGender'));
    if (!(ageNum >= 5 && ageNum <= 100)) return setError(t('errAge'));
    setBusy(true); setError(null);
    try { await api.updateMe({ ...draft, onboarded: true }); onSaved(); } catch (e) { setError(e); setBusy(false); }
  };

  return (
    <div className="page">
      <div>
        <h1 style={{ fontSize: 24 }}>{t('hello', { name: me.full_name.split(' ')[0] })}</h1>
        <p className="muted" style={{ margin: 0 }}>{t('setupIntro')}</p>
      </div>
      <div className="card stack">
        <div className="field">{t('gender')}
          <div className="choices">
            <button type="button" className="choice" aria-pressed={gender === 'male'} onClick={() => setGender('male')}>{t('male')}</button>
            <button type="button" className="choice" aria-pressed={gender === 'female'} onClick={() => setGender('female')}>{t('female')}</button>
          </div>
        </div>
        <label className="field">{t('age')}
          <input id="age" type="number" inputMode="numeric" min="5" max="100" value={age} onChange={(e) => setAge(e.target.value)} placeholder={t('agePh')} />
        </label>
        {canHijab && (
          <div className="field">{t('outfit')}
            <div className="choices">
              <button type="button" className="choice" aria-pressed={hijab} onClick={() => setHijab(true)}>{t('hijab')}</button>
              <button type="button" className="choice" aria-pressed={!hijab} onClick={() => setHijab(false)}>{t('noHijab')}</button>
            </div>
          </div>
        )}
      </div>
      {gender && ageNum >= 5 && (
        <div className="stage">
          <Figure slug="calf" look={look} />
          <span className="tag">{t('yourLook')}</span>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>{t('setupLocked')}</p>
      <ErrorBox error={error} />
      <button className="btn block" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
    </div>
  );
}
