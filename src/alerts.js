export function evaluateTargetAlert({ item, offers, previousOfferKey, preferredRegion = 'US' }) {
  if (!item?.alertEnabled || !Number.isFinite(Number(item.targetPrice)) || !item.providerId || preferredRegion !== 'US') {
    return { eligible: null, offerKey: null, shouldNotify: false, rearmed: false };
  }
  const eligible = offers.find((offer) => Number.isFinite(Number(offer.price)) && Number(offer.price) <= Number(item.targetPrice)) || null;
  const offerKey = eligible ? `${eligible.dealId}:${eligible.price}` : null;
  return {
    eligible,
    offerKey,
    shouldNotify: Boolean(eligible && offerKey !== previousOfferKey),
    rearmed: Boolean(!eligible && previousOfferKey)
  };
}
