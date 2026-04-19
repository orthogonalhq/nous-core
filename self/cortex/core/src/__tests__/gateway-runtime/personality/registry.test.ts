import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defineTrait,
  TRAIT_REGISTRY,
  type TraitAxes,
  type TraitValueDefinition,
} from '../../../gateway-runtime/personality/index.js';

// ---------------------------------------------------------------------------
// T1.1 — Registry tuple order (SDS I5, Goals C4)
// ---------------------------------------------------------------------------

describe('TRAIT_REGISTRY tuple order', () => {
  it('declared order is thoroughness → initiative → candor → communicationStyle → codeStyle', () => {
    expect(TRAIT_REGISTRY.map((t) => t.id)).toEqual([
      'thoroughness',
      'initiative',
      'candor',
      'communicationStyle',
      'codeStyle',
    ]);
  });

  it('registry length is 5', () => {
    expect(TRAIT_REGISTRY).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// T1.2 — TraitAxes structural equivalence (SDS I5, Goals C5)
// ---------------------------------------------------------------------------

describe('TraitAxes structural equivalence (type-level)', () => {
  type Expected = {
    thoroughness: 'strict' | 'standard';
    initiative: 'collaborative' | 'compliant';
    candor: 'strict' | 'standard';
    communicationStyle: 'detailed' | 'concise';
    codeStyle: 'minimal' | 'standard';
  };

  it('TraitAxes is assignable both directions against the expected shape', () => {
    expectTypeOf<TraitAxes>().toMatchTypeOf<Expected>();
    expectTypeOf<Expected>().toMatchTypeOf<TraitAxes>();
  });
});

// ---------------------------------------------------------------------------
// T1.3 — defineTrait inference (SDS I6, Goals C3)
// ---------------------------------------------------------------------------

describe('defineTrait inference (type-level)', () => {
  it('preserves literal types on id, default, and value keys', () => {
    const sampleTrait = defineTrait({
      id: 'sample',
      label: 'Sample',
      description: 'type-inference sanity check',
      default: 'a',
      values: {
        a: {
          label: 'A',
          description: 'a value',
          injection: { target: 'identity', fragment: 'alpha' },
        },
        b: {
          label: 'B',
          description: 'b value',
          injection: null,
        },
      },
    });

    // `default` keeps its literal-union typing (not `string`).
    expectTypeOf(sampleTrait.default).toEqualTypeOf<'a' | 'b'>();
    // `id` keeps its literal type (not `string`).
    expectTypeOf(sampleTrait.id).toEqualTypeOf<'sample'>();
    // The factory is identity-shaped at runtime.
    expect(sampleTrait.id).toBe('sample');
    expect(sampleTrait.default).toBe('a');
    expect(sampleTrait.values.a.injection).toEqual({
      target: 'identity',
      fragment: 'alpha',
    });
    expect(sampleTrait.values.b.injection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T1.4 — Registry shape validity (SDS I5 extended, Goals C4)
// ---------------------------------------------------------------------------

describe('TRAIT_REGISTRY runtime shape validity', () => {
  for (const trait of TRAIT_REGISTRY) {
    describe(`trait: ${trait.id}`, () => {
      it('has a non-empty id, label, and description', () => {
        expect(trait.id.length).toBeGreaterThan(0);
        expect(trait.label.length).toBeGreaterThan(0);
        expect(trait.description.length).toBeGreaterThan(0);
      });

      it('default value is present in values', () => {
        const values = trait.values as Record<string, TraitValueDefinition>;
        expect(Object.prototype.hasOwnProperty.call(values, trait.default)).toBe(
          true,
        );
      });

      it('every value has a non-empty label and description', () => {
        const values = trait.values as Record<string, TraitValueDefinition>;
        for (const [, value] of Object.entries(values)) {
          expect(value.label.length).toBeGreaterThan(0);
          expect(value.description.length).toBeGreaterThan(0);
        }
      });

      it('every injection is null or a well-formed { target, fragment }', () => {
        const values = trait.values as Record<string, TraitValueDefinition>;
        for (const [, value] of Object.entries(values)) {
          if (value.injection === null) continue;
          expect(['identity', 'outputContract']).toContain(
            value.injection.target,
          );
          expect(typeof value.injection.fragment).toBe('string');
          expect(value.injection.fragment.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// T1.5 — Standard-variant nullity (SDS I10, R4 mitigation)
// ---------------------------------------------------------------------------

const STANDARD_VARIANT_BY_TRAIT: Record<string, string> = {
  thoroughness: 'standard',
  initiative: 'compliant',
  candor: 'standard',
  communicationStyle: 'concise',
  codeStyle: 'standard',
};

describe('standard-variant nullity (SDS I10)', () => {
  for (const trait of TRAIT_REGISTRY) {
    it(`${trait.id}.${STANDARD_VARIANT_BY_TRAIT[trait.id]} has injection: null`, () => {
      const values = trait.values as Record<string, TraitValueDefinition>;
      const standardKey = STANDARD_VARIANT_BY_TRAIT[trait.id];
      expect(standardKey).toBeDefined();
      expect(values[standardKey].injection).toBeNull();
    });
  }
});
