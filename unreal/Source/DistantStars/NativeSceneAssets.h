#pragma once

#include "CoreMinimal.h"

class AActor;
class FResidenceTraffic;
class USceneComponent;

namespace DistantStars
{
// Existing simulation coordinates are right-handed, Y-up metres. Unreal is Z-up
// centimetres.
inline FVector ToNative(const FVector &Value, double Units = 100.0)
{
    return FVector(-Value.Z, Value.X, Value.Y) * Units;
}
inline FVector FromNative(const FVector &Value, double Units = 100.0)
{
    return FVector(Value.Y, Value.Z, -Value.X) / Units;
}
// Ephemerides use kilometres. Preserve angular size for remote bodies on a bounded
// sky shell; Earth is well inside this limit and retains physical atmosphere scale.
inline double OrbitalDisplayUnits(const FVector &PositionKm, double RadiusKm, bool bBackdrop)
{
    constexpr double CmPerKm = 100000, MaxDistanceCm = 1.e10;
    if (bBackdrop)
        return 2 * MaxDistanceCm / FMath::Max(1.0, RadiusKm);
    return FMath::Min(CmPerKm, MaxDistanceCm / FMath::Max(1.0, PositionKm.Size()));
}
bool LoadResidence(AActor *Owner, USceneComponent *Parent, FResidenceTraffic &Traffic, FString &Error);
} // namespace DistantStars
