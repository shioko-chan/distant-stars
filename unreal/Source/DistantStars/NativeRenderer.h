#pragma once
#include "Components/SceneComponent.h"
#include "CoreMinimal.h"
#include "ResidenceTraffic.h"
#include "NativeRenderer.generated.h"
class FJsonObject;
class USkeletalMeshComponent;
class UAnimSequence;
class UProceduralMeshComponent;
class UTexture2D;
class UMaterialInstanceDynamic;
class USkyAtmosphereComponent;
UCLASS()
class UNativeRenderer : public USceneComponent
{
    GENERATED_BODY()
  public:
    bool SetScene(const TSharedPtr<FJsonObject> &Data, FString &Error);
    void UpdateObjects(const TSharedPtr<FJsonObject> &Data, bool Replace);
    void UpdateResidence(double Seconds)
    {
        if (Mode == TEXT("residence"))
            Traffic.Tick(Seconds);
    }
    void UpdateCat(const TSharedPtr<FJsonObject> &Data);
    double Units = 100.0;
    FString Mode;

  private:
    void BuildBackground();
    UPROPERTY() TObjectPtr<UProceduralMeshComponent> Background;
    void PutObject(const TSharedPtr<FJsonObject> &Data);
    UMaterialInstanceDynamic *Material(const TSharedPtr<FJsonObject> &Data);
    UPROPERTY() TObjectPtr<USceneComponent> Residence;
    UPROPERTY() TObjectPtr<USkyAtmosphereComponent> Atmosphere;
    UPROPERTY() TObjectPtr<USceneComponent> CatRoot;
    UPROPERTY() TArray<TObjectPtr<USkeletalMeshComponent>> CatMeshes;
    UPROPERTY() TObjectPtr<UAnimSequence> CatIdle;
    UPROPERTY() TObjectPtr<UAnimSequence> CatWalk;
    bool bCatMoving = false;
    FResidenceTraffic Traffic;
    TMap<FString, uint32> ObjectSignatures;
    UPROPERTY() TMap<FString, TObjectPtr<UProceduralMeshComponent>> Objects;
    UPROPERTY() TMap<FString, TObjectPtr<UTexture2D>> Textures;
};
