/**
 * Liquid Workplace — L2 surface primitives.
 *
 * `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.2 asks for Anchor/Work/
 * Liquid/Ambient surfaces. These are the four, and they are deliberately thin:
 * a role, a couple of documented switches, and the caller's own children. All
 * appearance lives in `theme/liquid-surfaces.css` against `--lq-*` tokens, so a
 * shell that remaps its base vars gets these for free (§8: "a composition
 * language, not one palette").
 *
 * The one behaviour that is NOT stylistic and therefore lives here: an ambient
 * surface is decorative, so it is `aria-hidden` and inert. §2.3 forbids it
 * being the sole carrier of anything, and a token cannot enforce that.
 */
import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  /** Semantic element. Defaults to `div`; pass `section`/`aside`/`nav` when the surface *is* the landmark. */
  as?: ElementType;
  /** Step up one level of the role's own background. Not a new material. */
  raised?: boolean;
  children?: ReactNode;
};

function join(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

function makeSurface(role: string, baseClass: string) {
  const Component = forwardRef<HTMLElement, SurfaceProps>(function LiquidRoleSurface(
    { as: As = 'div', raised, className, children, ...rest },
    ref,
  ) {
    return (
      <As
        ref={ref}
        className={join(baseClass, className)}
        data-lq-role={role}
        data-raised={raised ? 'true' : undefined}
        {...rest}
      >
        {children}
      </As>
    );
  });
  Component.displayName = `${role[0].toUpperCase()}${role.slice(1)}Surface`;
  return Component;
}

const AnchorBase = makeSurface('anchor', 'lq-anchor');
const LiquidBase = makeSurface('liquid', 'lq-liquid');
const AmbientBase = makeSurface('ambient', 'lq-ambient');

/**
 * Reading, editing, forms, tables, logs, calendars, review cards. Opaque and
 * high-contrast in every theme — this is the role §2.3 protects from glass.
 *
 * `measure` caps direct children at `--lq-measure` for prose. Leave it off for
 * tables and logs, which need the full width.
 */
export const AnchorSurface = forwardRef<HTMLElement, SurfaceProps & { measure?: boolean }>(
  function AnchorSurface({ measure, ...rest }, ref) {
    return <AnchorBase ref={ref} data-measure={measure ? 'true' : undefined} {...rest} />;
  },
);

/** The app's primary canvas: the scrollable body a surface fills. Opaque, calmer than anchor. */
export const WorkSurface = makeSurface('work', 'lq-work');

/**
 * Navigation, transport, contextual tools, temporary inspectors. The only
 * translucent role, and only ever over content it is not replacing.
 *
 * `highlight` adds the inert specular top edge; `entering` is the pre-animation
 * state, whose displacement is already 0 under reduced motion.
 */
export const LiquidSurface = forwardRef<
  HTMLElement,
  SurfaceProps & { highlight?: boolean; entering?: boolean }
>(function LiquidSurface({ highlight = true, entering, ...rest }, ref) {
  return (
    <LiquidBase
      ref={ref}
      data-highlight={highlight ? 'true' : undefined}
      data-entering={entering ? 'true' : undefined}
      {...rest}
    />
  );
});

/**
 * Atmosphere behind everything. Decorative only: hidden from assistive tech and
 * inert to the pointer, so it cannot become a surface someone puts text on.
 */
export const AmbientSurface = forwardRef<HTMLElement, SurfaceProps>(function AmbientSurface(
  props,
  ref,
) {
  return <AmbientBase ref={ref} aria-hidden="true" {...props} />;
});

/** The role names, for a consumer that maps data to a surface. */
export const LIQUID_SURFACE_ROLES = ['anchor', 'work', 'liquid', 'ambient'] as const;
export type LiquidSurfaceRole = (typeof LIQUID_SURFACE_ROLES)[number];
