// Identifiers the stores use to recognise this extension. They are public — they
// appear in store URLs and in the shipped manifest — but they are not
// interchangeable and not guessable, so they live in one place rather than being
// repeated across the build and publish scripts.
//
// AMO generated this GUID when v1.3.0 was uploaded without an explicit id. Every
// installed copy is keyed to it, and AMO rejects an upload declaring a different
// id as a different add-on. Changing it would orphan existing users rather than
// update them.
export const FIREFOX_GECKO_ID = '{ae036afb-d846-4f79-a308-13c6e8191129}';
