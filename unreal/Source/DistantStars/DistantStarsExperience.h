#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "DistantStarsExperience.generated.h"

class ACameraActor;
class ADirectionalLight;
class ASkyLight;
class ARectLight;
class UNativeRenderer;
class SWebBrowser;
class IHttpRouter;
class FJsonObject;
class ADistantStarsExperience;

UCLASS()
class UDistantStarsInterface : public UObject
{
    GENERATED_BODY()
  public:
    UFUNCTION() void Submit(const FString &Message);
    TWeakObjectPtr<ADistantStarsExperience> Experience;
};

UCLASS()
class DISTANTSTARS_API ADistantStarsExperience : public AActor
{
    GENERATED_BODY()
  public:
    ADistantStarsExperience();
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
    virtual void Tick(float DeltaSeconds) override;

    void Submit(const FString &Message);

  private:
    void OpenInterface();
    void SendEvent(const TSharedRef<FJsonObject> &Event);
    UPROPERTY() TObjectPtr<ACameraActor> Camera;
    UPROPERTY() TObjectPtr<ADirectionalLight> Sun;
    UPROPERTY() TObjectPtr<ASkyLight> Sky;
    UPROPERTY() TArray<TObjectPtr<ARectLight>> ResidenceLights;
    UPROPERTY() TObjectPtr<UNativeRenderer> Renderer;
    UPROPERTY() TObjectPtr<UDistantStarsInterface> Interface;
    TSharedPtr<SWebBrowser> Browser;
    TSharedPtr<IHttpRouter> Router;
    FDelegateHandle RequestHandler;
    bool bMotionEnabled = true;
    double ResidenceSeconds = 0;
};
