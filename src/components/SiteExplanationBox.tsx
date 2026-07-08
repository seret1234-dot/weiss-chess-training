import type { SiteExplanation } from "../content/siteExplanations";

type Props = {
 explanation: SiteExplanation;
};

export function SiteExplanationBox({ explanation }: Props) {
 return (
 <section className="site-explanation-box">
 <div className="site-explanation-kicker">Idea</div>

 <h2 className="site-explanation-title">{explanation.title}</h2>

 <p>
 <strong>Main idea:</strong> {explanation.concept}
 </p>

 {explanation.lookFor && (
 <p>
 <strong>What to look for:</strong> {explanation.lookFor}
 </p>
 )}

 {explanation.howToUse && (
 <p>
 <strong>How to use it:</strong> {explanation.howToUse}
 </p>
 )}

 {explanation.goal && (
 <p>
 <strong>Training goal:</strong> {explanation.goal}
 </p>
 )}
 </section>
 );
}