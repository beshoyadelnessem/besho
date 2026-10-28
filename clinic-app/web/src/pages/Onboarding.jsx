import { useMemo, useState } from 'react';
import { api } from '../api/index.js';
import Figure, { lookOf } from '../components/Figure.jsx';
import { SKIN } from '../figure/rig.js';

// First visit (and later from settings): gender + age + look -> avatar used in every exercise.
export default function Onboarding({ me, onSaved, editing = false }) {
  const [gender, setGender] = useState(me.gender || '');
  const [age, setAge] = useState(me.birth_year ? String(new Date().getFullYear() - me.birth_year) : '');
  const [skin, setSkin] = useState(me.avatar?.skin || 2);
  const [hijab, setHijab] = useState(!!me.avatar?.hijab);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ageNum = Number(age);
  const draft = { gender, birth_year: ageNum ? new Date().getFullYear() - ageNum : null, avatar: { skin, hijab: gender === 'female' && hijab } };
  const look = useMemo(() => lookOf(draft), [gender, age, skin, hijab]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!gender) return setError('اختار ذكر أو أنثى');
    if (!(ageNum >= 8 && ageNum <= 100)) return setError('اكتب سنّك صح');
    setBusy(true); setError('');
    try { await api.updateMe({ ...draft, onboarded: true }); onSaved(); } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="page">
      <div>
        <h1 style={{ fontSize: 24 }}>{editing ? 'تعديل بياناتك' : `أهلاً يا ${me.full_name.split(' ')[0]}`}</h1>
        <p className="muted" style={{ margin: 0 }}>{editing ? 'الشكل ده هيظهر في كل التمارين.' : 'قولّنا شوية معلومات عنك، وهنعملك شخصية تظهر في كل تمارينك.'}</p>
      </div>
      <div className="card stack">
        <div className="field">النوع
          <div className="choices">
            <button type="button" className="choice" aria-pressed={gender === 'male'} onClick={() => setGender('male')}>ذكر</button>
            <button type="button" className="choice" aria-pressed={gender === 'female'} onClick={() => setGender('female')}>أنثى</button>
          </div>
        </div>
        <label className="field">العمر
          <input id="age" type="number" inputMode="numeric" min="8" max="100" value={age} onChange={(e) => setAge(e.target.value)} placeholder="مثلاً 28" />
        </label>
        {gender === 'female' && (
          <div className="field">اللبس
            <div className="choices">
              <button type="button" className="choice" aria-pressed={hijab} onClick={() => setHijab(true)}>محجبة (لبس طويل)</button>
              <button type="button" className="choice" aria-pressed={!hijab} onClick={() => setHijab(false)}>من غير حجاب</button>
            </div>
          </div>
        )}
        <div className="field">لون البشرة
          <div className="row">
            {Object.entries(SKIN).map(([k, c]) => (
              <button key={k} type="button" className="swatch" style={{ background: c }} aria-pressed={skin === Number(k)}
                aria-label={`لون ${k}`} onClick={() => setSkin(Number(k))} />
            ))}
          </div>
        </div>
      </div>
      {gender && (
        <div className="stage" style={{ aspectRatio: '3 / 2' }}>
          <Figure slug="calf" look={look} />
          <span className="tag">شكلك في التمارين</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <button className="btn block" onClick={save} disabled={busy}>{busy ? 'بيحفظ...' : 'حفظ'}</button>
    </div>
  );
}
