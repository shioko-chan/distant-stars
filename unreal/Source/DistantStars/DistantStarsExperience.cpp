#include "DistantStarsExperience.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/RectLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/DirectionalLight.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/RectLight.h"
#include "Engine/SkyLight.h"
#include "Engine/TextureCube.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "NativeRenderer.h"
#include "NativeSceneAssets.h"
#include "SWebBrowser.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"
#include "WebBrowserModule.h"
#include "HAL/IConsoleManager.h"

void UDistantStarsInterface::Submit(const FString &Message)
{
    if (Experience.IsValid())
        Experience->Submit(Message);
}

ADistantStarsExperience::ADistantStarsExperience()
{
    PrimaryActorTick.bCanEverTick = true;
    Renderer = CreateDefaultSubobject<UNativeRenderer>(TEXT("NativeRenderer"));
    SetRootComponent(Renderer);
}

void ADistantStarsExperience::BeginPlay()
{
    Super::BeginPlay();
    Camera = GetWorld()->SpawnActor<ACameraActor>();
    Camera->SetActorLocation(FVector(-800, 0, 300));
    Camera->SetActorRotation(FRotator(-15, 0, 0));
    Camera->GetCameraComponent()->SetFieldOfView(52);
    Camera->GetCameraComponent()->bConstrainAspectRatio = false;
    if (APlayerController *Controller = GetWorld()->GetFirstPlayerController())
    {
        Controller->SetViewTarget(Camera);
        Controller->bShowMouseCursor = true;
        Controller->SetInputMode(FInputModeGameAndUI().SetHideCursorDuringCapture(false));
    }
    Sun = GetWorld()->SpawnActor<ADirectionalLight>();
    Sun->GetLightComponent()->SetMobility(EComponentMobility::Movable);
    Sun->SetActorRotation(FRotator(-24, -48, 0));
    Sun->GetLightComponent()->SetIntensity(3.0f);
    auto SunComponent = Cast<UDirectionalLightComponent>(Sun->GetLightComponent());
    SunComponent->SetAtmosphereSunLight(true);
    SunComponent->bPerPixelAtmosphereTransmittance = true;
    Sky = GetWorld()->SpawnActor<ASkyLight>();
    Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);
    Sky->GetLightComponent()->SourceType = SLS_SpecifiedCubemap;
    Sky->GetLightComponent()->SetCubemap(
        LoadObject<UTextureCube>(nullptr, TEXT("/Engine/MapTemplates/Sky/DaylightAmbientCubemap")));
    Sky->GetLightComponent()->SetIntensity(.45f);
    Sky->GetLightComponent()->bLowerHemisphereIsBlack = false;
    Camera->GetCameraComponent()->PostProcessSettings.bOverride_AutoExposureMethod = true;
    Camera->GetCameraComponent()->PostProcessSettings.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
    Camera->GetCameraComponent()->PostProcessSettings.bOverride_AutoExposureBias = true;
    Camera->GetCameraComponent()->PostProcessSettings.AutoExposureBias = 0;
    Camera->GetCameraComponent()->PostProcessSettings.bOverride_AutoExposureApplyPhysicalCameraExposure =
        true;
    Camera->GetCameraComponent()->PostProcessSettings.AutoExposureApplyPhysicalCameraExposure = false;
    auto &Post = Camera->GetCameraComponent()->PostProcessSettings;
    Post.bOverride_BloomIntensity = true;
    Post.BloomIntensity = .25f;
    Post.bOverride_AmbientOcclusionIntensity = true;
    Post.AmbientOcclusionIntensity = .65f;
    for (const FVector Position : {FVector(-3, 4.5, -3), FVector(3, 4.5, 2)})
    {
        auto Lamp = GetWorld()->SpawnActor<ARectLight>();
        auto Light = Cast<URectLightComponent>(Lamp->GetLightComponent());
        Light->SetMobility(EComponentMobility::Movable);
        Lamp->SetActorLocation(DistantStars::ToNative(Position));
        Lamp->SetActorRotation(FRotator(-78, 0, 0));
        Light->SetIntensityUnits(ELightUnits::Lumens);
        Light->SetIntensity(ResidenceLights.IsEmpty() ? 600 : 350);
        Light->SetSourceWidth(250);
        Light->SetSourceHeight(150);
        Light->SetAttenuationRadius(1100);
        Light->SetLightColor(FLinearColor(1, .82, .61));
        // One soft key supplies contact shadows; the other panel is inexpensive fill.
        Light->SetCastShadows(ResidenceLights.IsEmpty());
        ResidenceLights.Add(Lamp);
    }
    OpenInterface();
}

void ADistantStarsExperience::OpenInterface()
{
    const FString WebRoot = FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir() / TEXT("Web"));
    if (!FPaths::FileExists(WebRoot / TEXT("index.html")))
    {
        UE_LOG(LogTemp, Error,
               TEXT("DistantStars: missing Content/Web/index.html. Build the "
                    "interface before launching."));
        return;
    }
    Router = FHttpServerModule::Get().GetHttpRouter(18766, true);
    if (!Router)
    {
        UE_LOG(LogTemp, Error,
               TEXT("DistantStars: could not bind the local interface server on "
                    "127.0.0.1:18766."));
        return;
    }
    RequestHandler = Router->RegisterRequestPreprocessor(FHttpRequestHandler::CreateLambda(
        [WebRoot](const FHttpServerRequest &Request, const FHttpResultCallback &Complete) {
            if (Request.Verb != EHttpServerRequestVerbs::VERB_GET)
            {
                auto Response =
                    FHttpServerResponse::Create(FString(TEXT("Method not allowed")), TEXT("text/plain"));
                Response->Code = EHttpServerResponseCodes::BadMethod;
                Complete(MoveTemp(Response));
                return true;
            }
            FString Relative = FGenericPlatformHttp::UrlDecode(Request.RelativePath.GetPath());
            Relative.RemoveFromStart(TEXT("/"));
            if (Relative.IsEmpty())
                Relative = TEXT("index.html");
            FString Filename = FPaths::ConvertRelativePathToFull(WebRoot / Relative);
            FPaths::CollapseRelativeDirectories(Filename);
            TArray<uint8> Bytes;
            if (!Filename.StartsWith(WebRoot + TEXT("/")) || !FFileHelper::LoadFileToArray(Bytes, *Filename))
            {
                auto Response = FHttpServerResponse::Create(FString(TEXT("Not found")), TEXT("text/plain"));
                Response->Code = EHttpServerResponseCodes::NotFound;
                Complete(MoveTemp(Response));
                return true;
            }
            const TMap<FString, FString> Types = {{TEXT("html"), TEXT("text/html; charset=utf-8")},
                                                  {TEXT("js"), TEXT("text/javascript; charset=utf-8")},
                                                  {TEXT("css"), TEXT("text/css; charset=utf-8")},
                                                  {TEXT("json"), TEXT("application/json")},
                                                  {TEXT("mp3"), TEXT("audio/mpeg")},
                                                  {TEXT("svg"), TEXT("image/svg+xml")},
                                                  {TEXT("png"), TEXT("image/png")},
                                                  {TEXT("jpg"), TEXT("image/jpeg")},
                                                  {TEXT("webp"), TEXT("image/webp")}};
            const FString *Type = Types.Find(FPaths::GetExtension(Filename).ToLower());
            auto Response =
                FHttpServerResponse::Create(MoveTemp(Bytes), Type ? *Type : TEXT("application/octet-stream"));
            Response->Headers.Add(TEXT("Cache-Control"), {TEXT("no-cache")});
            Complete(MoveTemp(Response));
            return true;
        }));
    FHttpServerModule::Get().StartAllListeners();
    IWebBrowserModule::Get();
    if(auto* GPU=IConsoleManager::Get().FindConsoleVariable(TEXT("r.CEFGPUAcceleration")))GPU->Set(0,ECVF_SetByCode);
    SAssignNew(Browser, SWebBrowser)
        .InitialURL(TEXT("about:blank"))
        .SupportsTransparency(true)
        .ShowControls(false)
        .ShowAddressBar(false)
        .ShowInitialThrobber(false)
        .BackgroundColor(FColor::Transparent)
        .OnConsoleMessage_Lambda([](const FString &Message, const FString &Source, int32 Line,
                                    EWebBrowserConsoleLogSeverity Severity) {
            UE_LOG(LogTemp, Display, TEXT("DistantStars UI: %s (%s:%d)"), *Message, *Source, Line);
        });
    Interface = NewObject<UDistantStarsInterface>(this);
    Interface->Experience = this;
    Browser->BindUObject(TEXT("distantstars"), Interface, true);
    GEngine->GameViewport->AddViewportWidgetContent(Browser.ToSharedRef(), 10);
    Browser->LoadURL(TEXT("http://127.0.0.1:18766/"));
}

void ADistantStarsExperience::Submit(const FString &Message)
{
    TSharedPtr<FJsonObject> Payload;
    if (Message.Len() > 16000000 ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Message), Payload) || !Payload)
    {
        UE_LOG(LogTemp, Warning, TEXT("DistantStars: invalid renderer message"));
        return;
    }
    FString Type;
    if (!Payload->TryGetStringField(TEXT("type"), Type))
        return;
    if (Type == TEXT("hello"))
    {
        auto Event = MakeShared<FJsonObject>();
        Event->SetStringField(TEXT("type"), TEXT("ready"));
        Event->SetNumberField(TEXT("version"), 1);
        SendEvent(Event);
    }
    else if (Type == TEXT("scene"))
    {
        FString Error;
        auto Event = MakeShared<FJsonObject>();
        if (Renderer->SetScene(Payload, Error))
        {
            const bool bResidence = Renderer->Mode == TEXT("residence");
            Sky->GetLightComponent()->SetIntensity(bResidence ? .45f : 1.2f);
            Sun->SetActorRotation(bResidence ? FRotator(-24, -48, 0) : FRotator(-32, -25, 0));
            for (auto Lamp : ResidenceLights)
                Lamp->GetLightComponent()->SetVisibility(bResidence);
            Event->SetStringField(TEXT("type"), TEXT("scene-ready"));
            Event->SetStringField(TEXT("mode"), Renderer->Mode);
            UE_LOG(LogTemp, Display, TEXT("DistantStars: native scene ready: %s"), *Renderer->Mode);
        }
        else
        {
            Event->SetStringField(TEXT("type"), TEXT("error"));
            Event->SetStringField(TEXT("message"), Error);
        }
        SendEvent(Event);
    }
#if WITH_DEV_AUTOMATION_TESTS
    else if (Type == TEXT("capture"))
        FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() / TEXT("Screenshots/Native.png"),
                                              true, false);
#endif
    else if (Type == TEXT("motion"))
        Payload->TryGetBoolField(TEXT("enabled"), bMotionEnabled);
    else if (Type == TEXT("cat"))
        Renderer->UpdateCat(Payload);
    else if (Type == TEXT("objects") || Type == TEXT("replace-objects"))
        Renderer->UpdateObjects(Payload, Type == TEXT("replace-objects"));
    else if (Type == TEXT("camera"))
    {
        const auto ReadVector = [&Payload](const TCHAR *Key) {
            const auto &A = Payload->GetArrayField(Key);
            return FVector(A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber());
        };
        const FVector Position = DistantStars::ToNative(ReadVector(TEXT("position")), Renderer->Units);
        const FVector Target = DistantStars::ToNative(ReadVector(TEXT("target")), Renderer->Units);
        Camera->SetActorLocationAndRotation(Position, (Target - Position).Rotation());
        const double Aspect =
            Payload->GetNumberField(TEXT("width")) / FMath::Max(1.0, Payload->GetNumberField(TEXT("height")));
        const double VerticalFov = Payload->GetNumberField(TEXT("fov"));
        Camera->GetCameraComponent()->SetFieldOfView(FMath::RadiansToDegrees(
            2 * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(VerticalFov * .5)) * Aspect)));
    }
}

void ADistantStarsExperience::SendEvent(const TSharedRef<FJsonObject> &Event)
{
    if (!Browser)
        return;
    FString Json;
    FJsonSerializer::Serialize(Event, TJsonWriterFactory<>::Create(&Json));
    Browser->ExecuteJavascript(TEXT("window.dispatchEvent(new "
                                    "CustomEvent('distant-stars-native',{detail:") +
                               Json + TEXT("}));"));
}

void ADistantStarsExperience::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (bMotionEnabled)
    {
        ResidenceSeconds += DeltaSeconds;
        Renderer->UpdateResidence(ResidenceSeconds);
    }
}

void ADistantStarsExperience::EndPlay(const EEndPlayReason::Type Reason)
{
    if (Browser)
    {
        Browser->UnbindUObject(TEXT("distantstars"), Interface, true);
        if (GEngine && GEngine->GameViewport)
            GEngine->GameViewport->RemoveViewportWidgetContent(Browser.ToSharedRef());
        Browser.Reset();
    }
    if (Router)
        Router->UnregisterRequestPreprocessor(RequestHandler);
    Router.Reset();
    Super::EndPlay(Reason);
}
