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
bool LoadResidence(AActor *Owner, USceneComponent *Parent, FResidenceTraffic &Traffic, FString &Error);
} // namespace DistantStars
