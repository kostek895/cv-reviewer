import { notFound } from "next/navigation";
import { CvTemplate } from "@/components/CvTemplate";
import { getJob, getPhoto } from "@/lib/store";

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string; v?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;
  const job = await getJob(id);
  if (!job?.cv) notFound();
  const photo = await getPhoto();
  // Zdjęcie jako data URL – PDF nie zależy od dodatkowych zapytań.
  const photoUrl = photo ? `data:${photo.type};base64,${photo.data.toString("base64")}` : null;

  return (
    <>
      {preview ? (
        <>
          <style>{`body{margin:0}`}</style>
          <script
            dangerouslySetInnerHTML={{
              __html: `document.body.classList.add('cv-preview');
function fit(){var w=document.documentElement.clientWidth;var z=Math.min(1,(w-24)/794);document.body.style.zoom=z;}
fit();addEventListener('resize',fit);`,
            }}
          />
        </>
      ) : null}
      <CvTemplate cv={job.cv} photoUrl={photoUrl} />
      <script dangerouslySetInnerHTML={{ __html: FIT_SCRIPT }} />
    </>
  );
}

/**
 * Dopasowanie do jednej strony: jeśli kolumna wystaje poza A4 o niewiele (do ~20%),
 * zmniejsza ją krokowo (zoom, min. 0.84). Większe nadmiary zostają na 2. stronie.
 * Ustawia window.__cvFitted – generator PDF czeka na tę flagę.
 */
const FIT_SCRIPT = `
(async function(){
  try { await document.fonts.ready; } catch(e) {}
  var cv = document.querySelector('.cv');
  if (!cv) { window.__cvFitted = true; return; }
  var side = [cv.querySelector('.cv-identity'), cv.querySelector('.cv-rest')].filter(Boolean);
  var main = [cv.querySelector('.cv-main')].filter(Boolean);
  function h(els){ return els.reduce(function(s,e){ return s + e.getBoundingClientRect().height; }, 0); }
  function page(){ return cv.getBoundingClientRect().width * 297 / 210; }
  function fit(els){
    var z = 1;
    if (h(els) <= page() || h(els) > page() * 1.2) return;
    while (h(els) > page() && z > 0.84) {
      z = Math.round((z - 0.01) * 100) / 100;
      els.forEach(function(e){ e.style.zoom = z; });
    }
  }
  fit(side); fit(main);
  window.__cvFitted = true;
})();
`;
