# Phase 5 Tool And License Review

Reviewed: 2026-07-18; OpenAI generation route rechecked 2026-07-19

This is a production-routing record, not legal advice. Terms, plan requirements, privacy defaults, and model availability must be rechecked on the day generation begins.

## Selected Workflow

| Production role | Selected tool | Decision |
|---|---|---|
| Concept exploration and controlled visual edits | ChatGPT Images in Codex | Primary. It is available in the current workspace, so a separate Midjourney workflow is not required. Use it for reference exploration and isolated component concepts, never direct runtime promotion. |
| Layer separation, paint-over, alpha repair, masks, grading | Krita or Adobe Photoshop | Human cleanup authority. Keep editable masters. |
| Optional generative fill during cleanup | Adobe Firefly inside Photoshop | Secondary only. Each use receives separate provenance and review. |
| Sprite redraw, anchor registration, sheet export | Aseprite | Manual production. Do not ask an image model for final animation continuity. |
| Hash, dimension, pairing, manifest, and budget checks | `validateAssetPackage()` | Mandatory mechanical gate. |

## OpenAI / ChatGPT Images

Generation-day recheck: the individual Terms of Use page reports an update dated 2026-01-16, and the Service Terms page reports an update dated 2026-06-12. The first isolated shelter-family generation is registered under `license.openai.codex_images.2026-07-19`; account-level Data Controls remain a user-visible setting that the generation tool cannot verify.

Current product finding:

- OpenAI documents ChatGPT Images 2.0 as available in ChatGPT and states that images can also be generated and edited in Codex. It supports conversational edits and selected-region editing.
- OpenAI's individual Terms of Use govern ChatGPT and image services; the business agreement assigns OpenAI's interest in output to the customer, while output still requires human review for third-party rights and suitability.
- In a personal ChatGPT workspace, training can be disabled under Data Controls. Business, Enterprise, Edu, and API inputs/outputs are not used for training by default. Temporary Chat has separate retention behavior.

Production conditions:

- Use only project-owned prompts and references with known rights.
- Do not upload confidential or third-party reference material without explicit rights.
- Before generation, confirm the account's Data Controls setting or use an eligible business/API workflow when privacy requires it.
- Record the visible product/model label, prompt, negative prompt, date, and generated job metadata available at the time.
- Treat every output as concept or source material until human cleanup and rights review pass.

Official sources:

- https://help.openai.com/en/articles/11084440
- https://openai.com/policies/terms-of-use/
- https://openai.com/policies/service-terms/
- https://help.openai.com/en/articles/7730893
- https://openai.com/business-data/

## Adobe Firefly / Photoshop

Current product finding:

- Adobe says non-beta Firefly outputs may be used commercially; beta features are also permitted unless the product explicitly says otherwise.
- Adobe says current Firefly models are trained on licensed content such as Adobe Stock plus public-domain material, and says it does not train Firefly on Creative Cloud subscribers' personal content.
- Submitting work to the public Firefly community grants additional gallery/marketing use, so this project must not submit production material to the community.

Production conditions:

- Use Firefly only for isolated cleanup/inpainting where it materially helps.
- Confirm the specific feature is not carrying an explicit commercial restriction.
- Do not submit the result or prompt to the Firefly community.
- Record the Adobe plan, feature, model/version if shown, prompt, reference rights, edits, and Content Credentials status.

Official sources:

- https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/adobe-firefly-faq.html
- https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html
- https://helpx.adobe.com/account/individual/terms-policies-and-regulations/content-analysis-faq.html

## Midjourney Comparison

Midjourney is not selected as the default tool for this project. It may be reconsidered only for early concept sheets.

Reasons:

- Midjourney is public and remixable by default. Stealth is restricted to Pro/Mega and still does not hide work created in a shared Discord space.
- Current terms say users own assets to the extent possible under law, but companies above the stated annual-revenue threshold need Pro or Mega for ownership/commercial company use.
- Its terms grant Midjourney a broad perpetual license over submitted content and generated assets.
- Those constraints add provenance/privacy friction without solving the later manual layer, mask, sprite, and anchor work.

If used, require Pro/Mega Stealth, the web Create page or a genuinely private space, no confidential references, and a fresh terms review.

Official sources:

- https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service
- https://docs.midjourney.com/hc/en-us/articles/32019750070669-Stealth-Mode
- https://docs.midjourney.com/hc/en-us/articles/27870375276557-Using-Images-Videos-Commercially

## Selection Conclusion

The recommended next-generation tool is the image generator already available in this Codex session, with ChatGPT Images used for concept/reference work and controlled variants. Adobe/Krita handles human normalization; Aseprite handles final sprite construction. Midjourney is optional, not required, and is a weaker default for this asset package because privacy and public-remix defaults add avoidable overhead.
