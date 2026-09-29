#pragma once
#include "CoreMinimal.h"
class UHierarchicalInstancedStaticMeshComponent;
class FJsonObject;
/** Native animation of the migrated timetables and flight paths, independent of
 * simulation time. */
class FResidenceTraffic
{
  public:
    bool Load();
    void Bind(const FString &Name, int32 MotionIndex, UHierarchicalInstancedStaticMeshComponent *Mesh,
              int32 InstanceIndex);
    void Tick(double Seconds);

  private:
    struct FBinding
    {
        TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent> Mesh;
        int32 Index = 0;
    };
    TMap<FString, TArray<FBinding>> Bindings;
    TSharedPtr<FJsonObject> Data;
    void Place(const FString &Name, int32 Index, double Arc, double Height, double Axial,
               const FVector &Scale, double Heading = 0);
};
