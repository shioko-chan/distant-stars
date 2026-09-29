#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "DistantStarsGameMode.generated.h"

UCLASS()
class DISTANTSTARS_API ADistantStarsGameMode : public AGameModeBase
{
    GENERATED_BODY()
  public:
    ADistantStarsGameMode();
    virtual void BeginPlay() override;
};
